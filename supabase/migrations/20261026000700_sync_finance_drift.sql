-- =====================================================================
-- Drift sync: 20261026000200_finance.sql was edited after it had been applied to
-- the linked project, and applied migrations never re-run. This brings the live
-- database in line with the file. Idempotent, additive.
--   * set_payment_attachment(): missing on the live project (app calls it from
--     src/services/finance.ts when a payment receipt is uploaded)
--   * v_party_summary: count only posted (Approved) documents, so supplier and
--     customer balances agree with the AP/AR control accounts
-- =====================================================================

create or replace function public.set_payment_attachment(p_payment uuid, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if not public.has_company_access(p.company_id) or not public.has_perm('payments', 'create') then
    raise exception 'Permission denied';
  end if;
  if p.attachment_path is not null then raise exception 'Payment already has an attachment'; end if;
  if p_path is null or p_path not like p.company_id::text || '/payments/%' then
    raise exception 'Attachment must be stored under this office''s payments folder';
  end if;
  update public.payments set attachment_path = p_path where id = p_payment;
end $$;

revoke execute on function public.set_payment_attachment(uuid, text) from public, anon;
grant execute on function public.set_payment_attachment(uuid, text) to authenticated;

create or replace view public.v_party_summary with (security_invoker = true) as
select 'Supplier'::public.party_type as party_type, s.id as party_id, s.opening_balance,
       coalesce(sum(i.grand_total) filter (where not i.is_credit_note), 0)        as total_invoiced,
       coalesce(sum(i.amount_paid) filter (where not i.is_credit_note), 0)        as total_paid,
       coalesce(sum(i.grand_total) filter (where i.is_credit_note), 0)            as total_credited,
       coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0) as outstanding,
       count(i.id) filter (where not i.is_credit_note)                            as invoice_count,
       s.opening_balance + coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0) as current_balance
from public.suppliers s
left join public.invoices i on i.supplier_id = s.id and i.approval_status = 'Approved'
group by s.id
union all
select 'Customer'::public.party_type, c.id, c.opening_balance,
       coalesce(sum(i.grand_total) filter (where not i.is_credit_note), 0),
       coalesce(sum(i.amount_paid) filter (where not i.is_credit_note), 0),
       coalesce(sum(i.grand_total) filter (where i.is_credit_note), 0),
       coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0),
       count(i.id) filter (where not i.is_credit_note),
       c.opening_balance + coalesce(sum(i.outstanding_amount) filter (where not i.is_credit_note), 0)
from public.customers c
left join public.invoices i on i.customer_id = c.id and i.approval_status = 'Approved'
group by c.id;

grant select on public.v_party_summary to authenticated;
