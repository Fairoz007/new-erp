-- One company, several offices: office-scoped document numbers must be unique across the company.
-- Every office keeps its own sequence, and the installed formats left the office code out, so each
-- office issued the same numbers (three offices -> three VH-001, three INV-2026-0001). Invoice and
-- credit-note numbers of one VAT-registered company must not repeat.
-- From now on the office code is part of every office-scoped number (VH-HO-001, INV-DQM-2026-0001).
-- Numbers already issued never change. A format an admin has already edited to include the code is
-- untouched; an admin can still switch it off in Settings -> Universal settings -> Document numbering.
alter table public.document_formats alter column include_office_code set default true;
update public.document_formats set include_office_code = true
 where scope = 'office' and not include_office_code;
