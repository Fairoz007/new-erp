-- Phase 3: custom fields engine hardening.
--  * definitions that already hold data keep their meaning: key / entity never change, the type
--    cannot change and dropdown options in use cannot be removed while values exist, and a used
--    definition cannot be deleted (deactivate it instead)
--  * file values must be storage references (storage://<bucket>/<path>) inside the record's office
--  * fields are re-validated when a vehicle's type changes (type-specific required fields)
--  * custom_field_usage(): how many records hold a value, for the Field Builder

-- ---------------------------------------------------------------------
-- 1. Where the values of an entity live
-- ---------------------------------------------------------------------
create or replace function public.custom_field_table(p_entity text) returns text
language sql immutable set search_path = public as $$
  select case p_entity when 'office' then 'companies' when 'vehicle' then 'vehicles' when 'client' then 'customers'
                       when 'supplier' then 'suppliers' when 'employee' then 'employees' when 'expense' then 'expenses' end
$$;

-- Records holding a value for this field (any office). Settings viewers only.
create or replace function public.custom_field_usage(p_field uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
declare d public.field_definitions; n integer;
begin
  if not public.has_perm('settings', 'view') then raise exception 'Permission denied' using errcode = '42501'; end if;
  select * into d from public.field_definitions where id = p_field;
  if d.id is null then return 0; end if;
  execute format('select count(*)::int from public.%I where custom_fields ? $1', public.custom_field_table(d.entity)) into n using d.key;
  return n;
end $$;
revoke execute on function public.custom_field_usage(uuid) from anon, public;
grant execute on function public.custom_field_usage(uuid) to authenticated;

-- Values of one field in use (distinct), used to protect dropdown options
create or replace function public._custom_field_values(p_entity text, p_key text) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare r text[];
begin
  execute format('select coalesce(array_agg(distinct custom_fields ->> $1), ''{}'') from public.%I where custom_fields ? $1',
                 public.custom_field_table(p_entity)) into r using p_key;
  return r;
end $$;
revoke execute on function public._custom_field_values(text, text) from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 2. Guard definitions that hold data
-- ---------------------------------------------------------------------
create or replace function public.trg_field_definition_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare used text[]; gone text[];
begin
  if tg_op = 'DELETE' then
    if cardinality(public._custom_field_values(old.entity, old.key)) > 0 then
      raise exception 'Field "%" holds data on existing records. Deactivate it instead of deleting it.', old.label;
    end if;
    return old;
  end if;
  if new.key is distinct from old.key or new.entity is distinct from old.entity then
    raise exception 'The key and record type of a field cannot change. Create a new field instead.';
  end if;
  if new.field_type is distinct from old.field_type then
    if cardinality(public._custom_field_values(old.entity, old.key)) > 0 then
      raise exception 'Field "%" holds data, so its type cannot change. Create a new field instead.', old.label;
    end if;
  end if;
  if new.field_type = 'dropdown' and new.options is distinct from old.options then
    used := public._custom_field_values(old.entity, old.key);
    select coalesce(array_agg(u), '{}') into gone from unnest(used) u where not (new.options ? u);
    if cardinality(gone) > 0 then
      raise exception 'Option(s) still used by records cannot be removed: %', array_to_string(gone, ', ');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.trg_field_definition_guard() from anon, authenticated, public;
drop trigger if exists field_definitions_guard on public.field_definitions;
create trigger field_definitions_guard before update or delete on public.field_definitions
  for each row execute function public.trg_field_definition_guard();

-- ---------------------------------------------------------------------
-- 3. Validation: same rules as before plus file references
-- ---------------------------------------------------------------------
create or replace function public.validate_custom_fields(p_entity text, p_company uuid, p_values jsonb, p_vehicle_type uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d record; v jsonb; out jsonb := coalesce(p_values, '{}'::jsonb); vis text; req boolean; missing text[] := '{}'; k text; s text;
begin
  if jsonb_typeof(out) <> 'object' then raise exception 'Custom fields must be an object'; end if;
  for k in select jsonb_object_keys(out) loop
    if not exists (select 1 from public.field_definitions where entity = p_entity and key = k) then
      raise exception 'Unknown custom field "%" for %', k, p_entity;
    end if;
  end loop;
  for d in select f.*, st.visibility from public.field_definitions f
           left join public.field_office_settings st on st.field_id = f.id and st.office_id = p_company
           where f.entity = p_entity and f.active
             and (f.office_id is null or f.office_id = p_company)
             and (f.vehicle_type_id is null or f.vehicle_type_id = p_vehicle_type)
  loop
    vis := coalesce(d.visibility, case when d.required then 'required' else 'shown' end);
    continue when vis = 'hidden';
    req := vis = 'required';
    v := out -> d.key;
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and btrim(v #>> '{}') = '') then
      if req then missing := missing || d.label; end if;
      out := out - d.key;
      continue;
    end if;
    case d.field_type
      when 'number' then
        if jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$' then
          out := jsonb_set(out, array[d.key], to_jsonb((v #>> '{}')::numeric));
        elsif jsonb_typeof(v) <> 'number' then raise exception '% must be a number', d.label; end if;
      when 'date' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '% must be a date (YYYY-MM-DD)', d.label; end if;
        perform (v #>> '{}')::date;
      when 'boolean' then
        if jsonb_typeof(v) = 'string' and lower(v #>> '{}') in ('true', 'false', 'yes', 'no') then
          out := jsonb_set(out, array[d.key], to_jsonb(lower(v #>> '{}') in ('true', 'yes')));
        elsif jsonb_typeof(v) <> 'boolean' then raise exception '% must be yes or no', d.label; end if;
      when 'dropdown' then
        if not (d.options ? (v #>> '{}')) then raise exception '% must be one of: %', d.label, (select string_agg(x, ', ') from jsonb_array_elements_text(d.options) x); end if;
      when 'file' then
        s := v #>> '{}';
        -- storage://documents/<office id>/...: an uploaded file of this record's office
        if jsonb_typeof(v) <> 'string' or s !~ '^storage://documents/[0-9a-f-]{36}/'
           or (p_company is not null and split_part(substr(s, 21), '/', 1) <> p_company::text) then
          raise exception '% must be a file uploaded for this office', d.label;
        end if;
      else
        if jsonb_typeof(v) <> 'string' then out := jsonb_set(out, array[d.key], to_jsonb(v #>> '{}')); end if;
        if length(out ->> d.key) > 2000 then raise exception '% is too long', d.label; end if;
    end case;
  end loop;
  if cardinality(missing) > 0 then raise exception 'Required field(s) missing: %', array_to_string(missing, ', '); end if;
  return out;
end $$;

-- Re-validate when the values change, or when a vehicle's type changes (type-specific fields).
-- Edits to other columns of old records are not blocked by fields made required later.
create or replace function public.trg_custom_fields() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_entity text; v_company uuid; v_type uuid;
begin
  if tg_op = 'UPDATE' and new.custom_fields is not distinct from old.custom_fields
     and (tg_table_name <> 'vehicles' or (to_jsonb(new) ->> 'vehicle_type_id') is not distinct from (to_jsonb(old) ->> 'vehicle_type_id')) then
    return new;
  end if;
  v_entity := case tg_table_name when 'companies' then 'office' when 'vehicles' then 'vehicle' when 'customers' then 'client'
                                 when 'suppliers' then 'supplier' when 'employees' then 'employee' when 'expenses' then 'expense' end;
  v_company := case tg_table_name when 'companies' then (to_jsonb(new) ->> 'id')::uuid
                                  else nullif(to_jsonb(new) ->> 'company_id', '')::uuid end;
  if tg_table_name in ('customers', 'suppliers') then v_company := nullif(to_jsonb(new) ->> 'office_id', '')::uuid; end if;
  if tg_table_name = 'vehicles' then v_type := (to_jsonb(new) ->> 'vehicle_type_id')::uuid; end if;
  new.custom_fields := public.validate_custom_fields(v_entity, v_company, new.custom_fields, v_type);
  return new;
end $$;
revoke execute on function public.trg_custom_fields() from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- 4. Fix: changing a vehicle's type by name (what the app sends) kept the old vehicle_type_id
--    and silently reverted the name. The name wins when only the name changed.
-- ---------------------------------------------------------------------
create or replace function public.trg_vehicle_type_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare t public.vehicle_types;
begin
  if coalesce(btrim(new.vehicle_type), '') <> ''
     and (new.vehicle_type_id is null
          or (tg_op = 'UPDATE' and new.vehicle_type is distinct from old.vehicle_type
              and new.vehicle_type_id is not distinct from old.vehicle_type_id)) then
    select * into t from public.vehicle_types where lower(name) = lower(btrim(new.vehicle_type));
    if not found then raise exception 'Unknown vehicle type "%"; add it under Settings > Vehicle types first', btrim(new.vehicle_type); end if;
    new.vehicle_type_id := t.id;
  end if;
  if new.vehicle_type_id is null then raise exception 'Vehicle type is required'; end if;
  select * into t from public.vehicle_types where id = new.vehicle_type_id;
  if not found then raise exception 'Unknown vehicle type'; end if;
  if (tg_op = 'INSERT' or new.vehicle_type_id is distinct from old.vehicle_type_id) and not t.active then
    raise exception 'Vehicle type % is inactive', t.name;
  end if;
  new.vehicle_type := t.name;
  if new.number_of_seats is null and t.seat_capacity is not null then new.number_of_seats := t.seat_capacity; end if;
  return new;
end $$;
revoke execute on function public.trg_vehicle_type_sync() from anon, authenticated, public;
