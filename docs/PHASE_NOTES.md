# Phase notes (defaults chosen and items not verified)

Running log for the final AUDIT_REPORT.md. Every phase: `npm run build` and `npm run test:db` pass.
Browser checks against a real database are blocked until the staging Supabase project is connected
(the app currently shows "Database connection not configured").

## Phase 1: Setup Wizard
- Custom field values are stored in a `custom_fields` jsonb column on each entity, validated by a trigger, instead of a separate field_values table.
- On an existing install the Super Admin can choose "Continue to app" from the wizard. Other users are blocked only when no organization exists.
- Recurring expense generation comes in Phase 8. Custom fields render in entity forms from Phase 3. Approval rules still use legacy required_roles until Phase 9.
- The opening-balance CSV skips already-posted rows only within the current screen session.
- The language setting affects documents only.

## Phase 2: Offices and isolation
- Clients and suppliers belong to a home office (`office_id`) and are shared in one of three modes: office only, selected offices, or all offices.
- Existing parties were backfilled as shared with all offices. Their home office is the office of their first invoice (or expense), otherwise the first office.
- A server-side insert with no office goes to the first office (by created_at, then name) with organization-wide sharing.
- An app user who can create parties in exactly one office gets that office. Otherwise the office is required.
- Office moves happen only through `transfer_to_office()`. A transfer needs edit rights in the current office and create rights in the destination, plus a reason and an effective date. Every transfer is logged in `office_transfers` and audited.
- What moves with a vehicle:
  - Mounted tyres move; scrapped or replaced tyres stay.
  - Drivers in the old office are unassigned.
  - The fixed asset moves at book value. Balanced journals in both offices go through 1600 Inter-Office Current Account, which nets to zero across the organization.
  - Open work orders block the transfer.
  - The vehicle's history (fuel, expenses, invoices) stays in the old office.
- Party balances (v_party_summary) are organization-wide, not split per office.
- Audit log rows without an office (users, roles, settings, clients and suppliers) show under every office filter.
- Not verified in a browser: the party office/sharing fields, the Sharing and Transfer buttons, the transfer history, and the office-filtered pickers on invoices, expenses and work orders.

## Phase 3: Custom fields
- Forms render the fields that apply to the record's office (and the vehicle's type) for offices, vehicles, clients, suppliers, employees and expenses. The database validates the same rules, so a direct API insert cannot skip a required field.
- On updates, values are re-checked only when they change or when a vehicle's type changes. A field made required later does not block edits to other columns of older records.
- File values must be a `storage://documents/<office id>/…` reference uploaded for that office.
- Definitions that hold data:
  - The key and record type of a field never change.
  - The type cannot change and dropdown options in use cannot be removed.
  - The field cannot be deleted; deactivate it instead.
  - The Field Builder shows how many records use each field and offers Delete only when none do.
- Fields marked "show in list" become sortable table columns, included in CSV/PDF export. Search covers all custom values. The filter control supports dropdown and yes/no values (equality), number and date ranges, and text contains. The offices page shows the values on each card. Search and filter run in the browser over loaded rows.
- Fix: changing a vehicle's type by name was silently reverted (Phase 1 trigger). Fixed, and vehicle forms now use the vehicle-type master instead of a hard-coded list that included types the database rejects.
- The office form no longer offers a currency list. Offices use the organization base currency unless currency is overridable.
- Not verified in a browser: every custom field form and list column (needs the staging DB).
- Still hard-coded: "OMR" in a few quick-add labels and toasts; to fix in Phase 7.

## Phase 4: Client and supplier registration
- Approval of new registrations is optional, set per organization (Settings → Universal settings → "New clients and suppliers need approval"; off by default). When it is on, a party created by someone without approve rights in its home office starts as Pending. Pending and Rejected parties cannot be used on invoices, bills, payments, expenses or contracts in any office. The database enforces this, not only the pickers.
- Approve or reject happens on the party page or under Approvals → Registrations. `review_party()` needs approve rights in the home office and blocks approving your own submission (super admins excepted). Rejecting requires a reason. The submitter is notified. Editing a rejected registration sends it back to Pending.
- Duplicates are blocked in the database per party type, across the whole organization: VAT number and CR number (case-, space- and punctuation-insensitive) and email (case-insensitive). Rejected registrations do not block. The error names the existing record's code.
- Opening balances are no longer typed on the party form; that field was only a memo that skewed balances. Use "Post opening balance" on the party page, which posts a real opening invoice or bill. App users cannot write `opening_balance` directly.
- The party detail page (`#customer-detail?id=…`, `#supplier-detail?id=…`) replaces the old pop-up modals. It shows KPIs, invoices or bills, payments, contracts and change history. Global search finds clients and suppliers by name, code, VAT, CR or email and opens this page.
- Contracts: numbered CON-…, in the office's currency, status Draft, Active, Suspended or Terminated. "Expired" is shown for an Active contract past its end date. Only Draft contracts can be deleted. The signed copy is stored under the office's documents folder. Rate cards have lines per vehicle type and unit. `contract_rate()` returns the active contract rate, otherwise the default fee schedule; invoice forms will use it from Phase 7.
- CSV: "Export all fields" writes every column, custom fields as `cf_<key>`, and home office by code. The import template uses the same columns. Import checks each row before sending: required name, type, email, numbers, office code and rights, duplicates against existing records and within the file, and custom-field rules. Valid rows are saved one by one through the normal service, so the database rules still apply, and each row shows its result. Limits: 2 MB and 1000 rows. File-type custom fields and bank details are not imported. "Selected offices" sharing is set after import.
- Export file names no longer carry the old "FleetX_" prefix.
- Not verified in a browser (needs the staging DB): the registration flow, the detail page, contracts and rate cards, and CSV import/export.
