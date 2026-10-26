# Agent A - Fleet operations (modules A1-A10)

Files: `src/services/fleet.ts`, `supabase/migrations/20261026000100_fleet.sql`, `supabase/tests/20261026000100_fleet.test.mjs` (17/17; full `npm run test:db` green), pages under companies, vehicles (+detail), maintenance (+work orders), oil-management, tyre-management, accidents, expenses, profitability. New components: `CompanyFormModal`, `VehicleEditModal`, `VehiclePhoto` (+`useVehiclePhotoUrls`), `TyreEditModal`, `AccidentUpdateModal`. Small additive type change: optional `storagePath` on maintenance/accident attachments (`src/types/maintenance.ts`, `operations.ts`). Nothing written to the remote DB.

`tsc`: my files clean except the expected `addCompany` / `updateCompany` not on `FleetContextType` (CompaniesPage).

## Design decisions (DB side, migration 000100)
Side effects that used to be client state mutations are now SECURITY DEFINER triggers, so they are atomic and also work for roles without `vehicles` write permission (e.g. Maintenance Manager):
- Totals computed by the DB: maintenance (`parts+labour+tax+other-discount`, except work-order-created rows), oil (`oil+filter+labour+tax`), expense (`qty*unit+tax`).
- Vehicle timeline rows (vehicle added, status change, maintenance, oil, tyre event, accident, expense) - no client timeline inserts.
- Odometer: maintenance / oil insert raises `vehicles.current_mileage` (never lowers it).
- Accident insert sets vehicle `Accident` (not Sold/Scrapped); status Closed/Completed releases it unless another claim is open.
- Work order insert: if an active `maintenance` approval rule has threshold <= estimated cost the DB forces `approval_status='Pending'` and inserts the `approval_requests` row (requested_by = auth.uid(), levels = rule roles). Client cannot opt out. Guard trigger: cannot move Pending/Rejected orders forward; only a user who `can_approve('maintenance', cost)` may change `approval_status` (decide_approval passes). Cannot create as Completed.
- Unpaid/partially-paid maintenance with a supplier raises a purchase invoice in `Pending Approval` (numbered by `next_doc_number`, supplier's own number kept in `reference_number`, terms from supplier, one `MNT-SRV` line; a second line carries the tax if the 2-decimal rate cannot reproduce it). It reaches the GL when approved via `post_invoice`. The old client behaviour (invoice created as Approved without GL, supplier balance edited in JS) is gone. `Paid` records raise no payable. **Agent B/coordinator: please confirm this is the wanted rule.**
- Same-office guard: tyres, tyre_events, oil_changes, work_orders, maintenance_records, accidents, expenses must share `company_id` with their vehicle.

## Inventory

| ID | Module / route | Components |
|---|---|---|
| A1 | Companies `companies` | CompaniesPage, CompanyFormModal |
| A2 | Vehicles `vehicles` | VehiclesPage, VehicleEditModal, QuickActionModals `add-vehicle` |
| A3 | Vehicle detail `vehicle-detail` (10 tabs) | VehicleDetailPage |
| A4 | Maintenance `maintenance` | MaintenancePage, `add-maintenance` modal |
| A5 | Work orders `work-orders` | WorkOrdersPage (list + kanban), `add-work-order` modal |
| A6 | Oil `oil-management` | OilManagementPage, `add-oil-change` modal |
| A7 | Tyres `tyre-management` | TyreManagementPage, TyreEditModal, `add-tyre` modal |
| A8 | Accidents `accidents` | AccidentsPage, AccidentUpdateModal, `add-accident` modal |
| A9 | Expenses `expenses` | ExpensesPage, `add-expense` modal |
| A10 | Profitability `profitability` | VehicleProfitabilityPage (read-only) |

### Action inventory (control -> behaviour -> backend -> tables -> permission -> status)
| Control | Backend op | Tables | Permission (matrix module) | Status |
|---|---|---|---|---|
| A1 Add Office | `addCompany` insert (E's trigger seeds CoA + membership) | companies | companies:edit | new, needs context fn |
| A1 Edit | `updateCompany` | companies | companies:edit | new, needs context fn |
| A1 Filter / consolidated | client filter | - | - | works |
| A1 "Sync Dual Offices" (reset ALL data) | removed | - | - | removed (destructive, fake) |
| A2 Add New Vehicle | `addVehicle` (modal) | vehicles (+timeline trigger) | vehicles:create | service done; modal has dummy defaults (see notes) |
| A2 Edit (row action) | `updateVehicle` | vehicles | vehicles:edit | new |
| A2/A3 Status change | inside Edit | vehicles (+Status timeline) | vehicles:edit | new |
| A3 Delete | `deleteVehicle`, confirm; FK-protected | vehicles | vehicles:delete | new |
| A3 + Service/Oil/Expense/Upload/Add Tyre/Accident | open quick modals (vehicle preselected by coordinator sync) | - | per modal | works; `add-tyre` button added |
| A3 Documents Download | `downloadDocument` (signed URL) | documents | documents:view | fixed (was window.open on raw URL) |
| A4 Record Maintenance | `addMaintenanceRecord` | maintenance_records (+timeline, odometer, pending invoice) | maintenance:create | button gated |
| A5 Approve / Start / Wait / Resume / Complete / Cancel / Advance | `updateWorkOrderStatus`; Complete = `complete_work_order` RPC | work_orders, maintenance_records | work-orders:edit (+`canApprove`) | async, pending state, approval-pending shows "Awaiting approval", Rejected only cancel |
| A5 Create Work Order | `addWorkOrder` | work_orders, approval_requests (trigger) | work-orders:create | gated |
| A6 Record Oil Service | `addOilChange` | oil_changes | oil:create | gated; status derived live |
| A7 Add Tyre | `addTyre` (modal) | tyres | tyres:create | new button |
| A7 Update | `updateTyre` | tyres | tyres:edit | new |
| A7 Order Tyre Service | opens work-order modal | - | work-orders:create | gated |
| A8 Report Accident | `addAccident` | accidents | accidents:create | gated |
| A8 Update claim (status, costs) | `updateAccident` | accidents (+vehicle status trigger) | accidents:edit | new |
| A9 Add Expense | `addExpense` | expenses | expenses:create | gated; "Upload Entry Bill" duplicate button removed |
| A9 View receipt | `openBillModal(storage://documents/<path>)` | storage | expenses:view | fixed (no fake receipt) |
| A10 | `getVehicleFinancialSummary` | - | vehicles:view | fabricated fuel cost removed |

## Issues
| Sev | Issue | Status |
|---|---|---|
| P0 | All state in localStorage, ids/numbers made client-side | service layer + DB numbering |
| P0 | Pending-approval work orders could be advanced/completed from UI; `approval_status` editable by anyone with edit | trigger guard + UI blocks |
| P1 | addMaintenanceRecord created an Approved supplier invoice outside the GL and edited supplier balance in JS | replaced by pending invoice trigger |
| P1 | addVehicle fabricated 5 "Standard OEM" tyres at 60 OMR | removed |
| P1 | CompaniesPage: hard-coded CR/VAT/Tax numbers, "Al Hakim National LLC", only comp-1/comp-2 listed, "Sync" button reset all data | rewritten from data, create/edit added |
| P1 | ExpensesPage fake receipt (unsplash) for any Fuel/Insurance/Registration expense; "receipts uploaded" counted categories | real attachment only |
| P1 | Profitability `fuelCost = opCost*0.45` | removed |
| P1 | Work order completion used fake supplier `sup-2` and 65/30/5 splits | RPC uses the order's own figures |
| P2 | Oil status stored once; old services showed Overdue after a newer one | derived live, only latest per vehicle |
| P2 | Expense category filter values did not match categories; search on missing `vendorName` | fixed |
| P2 | Vehicle detail: "Standard"/"Factory" placeholders for missing tyres, "undefined (undefined)" department | fixed |
| P2 | No Edit/Delete/Update UI for vehicles, tyres, accidents, companies | added |
| P2 | Totals trusted from client | DB recomputes |
| P3 | Net accident cost floored at 0 in mapper (as before) | kept |
| P3 | Replacement thresholds in Profitability are fixed heuristics | labelled "rule-based" |
| Open | Accident/maintenance attachments have no UI; service supports `storagePath`/`storage://` refs | TODO with Agent F components |
| Open | Notification for approval-required work orders (old code created one) | Agent D (can be a trigger on approval_requests) |

## Dummy data found -> action
Removed: default tyres, fake receipt URL, fake fuel cost, hard-coded company identity numbers, sup-2 fallback, "Standard/Factory/Merchant" placeholders. **Still in QuickActionModals (coordinator)**: add-vehicle writes fabricated `engineNumber 'ENG-10029'`, `vin 'VIN-<Date.now>'`, `registrationNumber 'REG-<plate>'`, insurance provider "Oman United Insurance Co", premium 300, policy `POL-<n>`, purchase invoice `PINV-ACQ-<n>`, market value = 90% of purchase, oil `estimatedCost 35`, `capacityLitres 6.5`, `intervalMonths 6`, default unsplash `photoUrl`; add-work-order sets `partsCharges = 65%`, `labourCharges = 30%`, `tax = 5%` of the estimate and `finalCost = estimate`; add-oil-change `nextOilChangeDate = today+180d`; add-accident reads `mntForm.supplierId`. These should become empty/optional fields.

## Coordinator integration notes
New/changed `FleetContext` functions (all async; call the service then refetch `affects[name]`):
- `addCompany(data: Omit<Company,'id'>): Promise<Company>` and `updateCompany(id, updates: Partial<Company>): Promise<Company>` - **missing in FleetContextType; CompaniesPage uses them**.
- `addVehicle(data): Promise<Vehicle>` (ignores `vehicleId`, DB assigns `VH-001`), `updateVehicle(id, updates): Promise<Vehicle>`, `deleteVehicle(id): Promise<void>` (throws if linked records), `addMaintenanceRecord`, `addWorkOrder` (approval fields ignored; DB decides), `updateWorkOrderStatus(id, status, actualCost?): Promise<void>`, `addOilChange` (next mileage = odometer + vehicle oil interval), `addTyre`, `updateTyre(id, updates): Promise<Tyre>`, `addTyreEvent`, `addAccident`, `updateAccident(id, updates): Promise<Accident>`, `addExpense`. Same params as before.
- `getVehicleFinancialSummary(vehicleId)` in context should call `fleet.getVehicleFinancialSummary(vehicleId, { vehicles, maintenanceRecords, accidents, oilChanges, tyres, tyreEvents, expenses, invoices })`. Revenue now counts only Approved sales invoices net of credit notes.
- Load with `fleet.fetchers` (companies, vehicles, tyres, tyreEvents, oilChanges, maintenanceRecords, workOrders, accidents, expenses, timeline); `affects` map exported. Collections are paginated past 1000 rows.
- Remove the context-side side effects (timeline, mileage, invoice, supplier balance, default tyres, vehicle status): the DB does them. Remove `logAudit` calls (audit triggers).
- After `addCompany` the user's memberships change: AuthContext should refresh `memberCompanyIds` (Agent G).

QuickActionModals call-site changes (await + try/catch, success toast after await, disable submit while pending):
- add-vehicle: stop sending fabricated defaults (above); `photoUrl` should be a `media` path (upload with `uploadFile(file, companyId, 'vehicles', {bucket:'media'})`) or empty; `companyName`/`vehicleId` are ignored.
- add-maintenance: `totalCost` ignored by DB; attachments must be uploaded first (`storagePath`).
- add-work-order: send real figures (or zeros), not 65/30/5 splits; `requestedBy` ignored (auth user used).
- add-expense: upload the receipt first (`uploadFile(file, companyId, 'expenses')`) and pass `attachmentUrl: toStorageRef('documents', stored.path)`; blob/data URLs now throw "receipt has not been uploaded". On save failure call `removeFiles('documents',[path])`.
- add-oil-change, add-tyre, add-accident: just await.

Requests: Agent B - confirm pending purchase-invoice rule (line item shape, `Paid` handling). Agent D - notification for pending work-order approval; `approval_requests` rows for work orders now come from the DB trigger, so `decide_approval` works unchanged. Agent E - numbering triggers must accept NULL for `vehicle_code`, `work_order_number`, `record_number`, `accident_number`, `expense_number`; my invoice trigger uses `next_doc_number('PINV-YYYY', 4)` so it does not depend on the invoice trigger. Agent F - none.
