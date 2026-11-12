-- Phase 3: one wording per rule.
-- post_invoice refused a zero total with 'Invoice has no lines', also when the invoice has lines
-- (e.g. a line priced 0). Every other invoice function says 'Invoice total must be greater than
-- zero' for the same rule, and that is what the invoice form shows. Only the message changes; the
-- function body is otherwise kept exactly as defined by the latest migration.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.post_invoice(uuid)'::regprocedure);
  if position('Invoice has no lines' in d) > 0 then
    execute replace(d, '''Invoice has no lines''', '''Invoice total must be greater than zero''');
  end if;
end $$;
