-- Supabase runs pg_safeupdate for API requests: an UPDATE or DELETE without a WHERE clause is
-- refused ("UPDATE requires a WHERE clause"), also inside functions the request calls. PGlite does
-- not, so these were only seen on the hosted project (Setup Wizard, 2026-11-12):
--   * save_setup_progress  - "Progress not saved" on every wizard step
--   * complete_setup       - Finish would fail
--   * _payroll_fill        - payroll generation would fail (clears its temp table)
-- Each statement gets an explicit WHERE; nothing else in the functions changes. The organization
-- table holds one row (one company), so the updates still touch exactly that row.
do $$
declare
  d text; n text;
  fixes text[][] := array[
    array['public.save_setup_progress(integer, integer[])', 's where s between 1 and 9);', 's where s between 1 and 9) where true;'],
    array['public.complete_setup()', 'setup_completed_steps = ''{1,2,3,4,5,6,7,8,9}'';', 'setup_completed_steps = ''{1,2,3,4,5,6,7,8,9}'' where true;'],
    array['public._payroll_fill(uuid)', 'delete from _payroll_keep;', 'delete from _payroll_keep where true;']
  ];
begin
  for i in 1 .. array_length(fixes, 1) loop
    d := pg_get_functiondef(fixes[i][1]::regprocedure);
    n := replace(d, fixes[i][2], fixes[i][3]);
    if n = d then raise exception 'where_clauses: statement not found in %', fixes[i][1]; end if;
    execute n;
  end loop;
end $$;
