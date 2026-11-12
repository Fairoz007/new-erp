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
