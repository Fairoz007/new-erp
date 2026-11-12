-- Two numbers were still built from a hard-coded prefix instead of the numbering formats
-- (document_formats), so they ignored the office code and any prefix set in Settings:
--   * trg_maintenance_after_insert - the supplier bill raised from a maintenance record
--     ('PINV-2026-0001' in every office, while bills entered by hand were 'PINV-HO-2026-0001')
--   * run_depreciation             - the depreciation batch number ('DEP-2026-01')
-- Both now use doc_prefix / doc_pad like every other document. Nothing else in the functions
-- changes. Numbers already issued are kept.
do $$
declare
  d text; n text;
  fixes text[][] := array[
    array['public.trg_maintenance_after_insert()',
          'public.next_doc_number(new.company_id, ''PINV-'' || extract(year from new.maintenance_date)::int, 4)',
          'public.next_doc_number(new.company_id, public.doc_prefix(''purchase_invoice'', new.company_id, new.maintenance_date), public.doc_pad(''purchase_invoice''))'],
    array['public.run_depreciation(uuid, date, text, boolean)',
          'public.next_doc_number(p_company, ''DEP-'' || extract(year from v_period)::int, 2)',
          'public.next_doc_number(p_company, public.doc_prefix(''depreciation'', p_company, v_period), public.doc_pad(''depreciation''))']
  ];
begin
  for i in 1 .. array_length(fixes, 1) loop
    d := pg_get_functiondef(fixes[i][1]::regprocedure);
    n := replace(d, fixes[i][2], fixes[i][3]);
    if n = d then raise exception 'numbering_formats: statement not found in %', fixes[i][1]; end if;
    execute n;
  end loop;
end $$;
