-- A save can take more than one request: "Save Expense" inserts the expense, then calls
-- submit_expense, which posts its journal. Both requests carry the form's request key, so the
-- journal insert found the key already claimed (by the expense, in another transaction) and was
-- refused with "This was already saved ... submitted twice". Every expense saved from the form
-- stayed a draft (seen on the hosted project, 2026-11-12).
--
-- A key is now claimed once per table: the same key may create the expense and, in the next
-- request, the journal for it; a repeated save (double click, retry) still repeats the first
-- insert and is refused there, so no document is created twice.
alter table public.request_keys drop constraint if exists request_keys_pkey;
alter table public.request_keys add primary key (key, table_name);

create or replace function public.trg_claim_request_key() returns trigger
language plpgsql security definer set search_path = public as $$
declare k uuid := public.request_key(); prev record;
begin
  if k is null then return new; end if;
  select * into prev from public.request_keys where key = k and table_name = tg_table_name;
  if found then
    if prev.txid = txid_current() then return new; end if;     -- same save, another row of it
    raise exception 'This was already saved. It was submitted twice (double click or retry), so the second copy was not created. Refresh the list to see it.'
      using errcode = 'PT409';
  end if;
  insert into public.request_keys (key, table_name) values (k, tg_table_name);
  return new;
end $$;
revoke all on function public.trg_claim_request_key() from public, anon, authenticated;
