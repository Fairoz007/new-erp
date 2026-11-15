-- Upgrade stage 3: the organization's legal name in Arabic, printed with the English name on
-- invoices, notes and statements (the letterhead shows both). Optional, plain text.
alter table public.organizations add column if not exists legal_name_ar text;
alter table public.organizations drop constraint if exists organizations_legal_name_ar_len;
alter table public.organizations add constraint organizations_legal_name_ar_len
  check (legal_name_ar is null or char_length(legal_name_ar) <= 200);
comment on column public.organizations.legal_name_ar is 'Legal name in Arabic (optional), printed on documents next to legal_name.';
