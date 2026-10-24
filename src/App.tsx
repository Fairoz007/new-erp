import React from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { FleetProvider } from './context/FleetContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider, useUI } from './context/UIContext';
import { AppLayout } from './components/layout/AppLayout';
import { Button } from './components/ui/Button';

// Page Imports
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { CompaniesPage } from './pages/companies/CompaniesPage';
import { VehiclesPage } from './pages/vehicles/VehiclesPage';
import { VehicleDetailPage } from './pages/vehicles/VehicleDetailPage';
import { MaintenancePage } from './pages/maintenance/MaintenancePage';
import { WorkOrdersPage } from './pages/maintenance/WorkOrdersPage';
import { OilManagementPage } from './pages/oil-management/OilManagementPage';
import { TyreManagementPage } from './pages/tyre-management/TyreManagementPage';
import { AccidentsPage } from './pages/accidents/AccidentsPage';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { SuppliersPage } from './pages/suppliers/SuppliersPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { ReconciliationPage } from './pages/reconciliation/ReconciliationPage';
import { PaymentsPage } from './pages/payments/PaymentsPage';
import { AccountingPage } from './pages/accounting/AccountingPage';
import { TrialBalancePage } from './pages/accounting/TrialBalancePage';
import { GeneralLedgerPage } from './pages/accounting/GeneralLedgerPage';
import { ProfitLossPage } from './pages/profit-loss/ProfitLossPage';
import { BalanceSheetPage } from './pages/balance-sheet/BalanceSheetPage';
import { DepreciationPage } from './pages/depreciation/DepreciationPage';
import { AssetModulePage } from './pages/depreciation/AssetModulePage';
import { PayrollPage } from './pages/payroll/PayrollPage';
import { VehicleProfitabilityPage } from './pages/profitability/VehicleProfitabilityPage';
import { DocumentsPage } from './pages/documents/DocumentsPage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';
import { UsersRolesPage } from './pages/users-roles/UsersRolesPage';
import { ApprovalsPage } from './pages/approvals/ApprovalsPage';
import { AuditLogsPage } from './pages/audit-logs/AuditLogsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { SettingsPage } from './pages/settings/SettingsPage';

const PageRenderer: React.FC = () => {
  const { currentPage, setCurrentPage } = useUI();
  const { canAccessPage, currentUser } = useAuth();

  if (!canAccessPage(currentPage)) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-700 rounded-2xl p-6 sm:p-8 text-center shadow-card space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100">Access Restricted</h2>
            <p className="text-xs text-slate-400 mt-1">
              Your active role profile (<span className="font-semibold text-slate-200">{currentUser.role}</span>) does not have authorization to view or manage the requested section (<span className="font-mono text-indigo-600">#{currentPage}</span>).
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => setCurrentPage('dashboard')}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
            >
              Return to Executive Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  switch (currentPage) {
    case 'dashboard':
      return <DashboardPage />;
    case 'companies':
      return <CompaniesPage />;
    case 'vehicles':
      return <VehiclesPage />;
    case 'vehicle-detail':
      return <VehicleDetailPage />;
    case 'maintenance':
      return <MaintenancePage />;
    case 'work-orders':
      return <WorkOrdersPage />;
    case 'oil-management':
      return <OilManagementPage />;
    case 'tyre-management':
      return <TyreManagementPage />;
    case 'accidents':
      return <AccidentsPage />;
    case 'expenses':
      return <ExpensesPage />;
    case 'suppliers':
      return <SuppliersPage />;
    case 'customers':
      return <CustomersPage />;
    case 'invoices':
      return <InvoicesPage />;
    case 'reconciliation':
      return <ReconciliationPage />;
    case 'payments':
      return <PaymentsPage />;
    case 'trial-balance':
      return <TrialBalancePage />;
    case 'general-ledger':
      return <GeneralLedgerPage />;
    case 'accounting':
      return <AccountingPage />;
    case 'profit-loss':
      return <ProfitLossPage />;
    case 'balance-sheet':
      return <BalanceSheetPage />;
    case 'depreciation':
      return <DepreciationPage />;
    case 'fixed-assets':
      return <AssetModulePage />;
    case 'payroll':
      return <PayrollPage />;
    case 'profitability':
      return <VehicleProfitabilityPage />;
    case 'documents':
      return <DocumentsPage />;
    case 'notifications':
      return <NotificationsPage />;
    case 'users-roles':
      return <UsersRolesPage />;
    case 'approvals':
      return <ApprovalsPage />;
    case 'audit-logs':
      return <AuditLogsPage />;
    case 'reports':
      return <ReportsPage />;
    case 'settings':
      return <SettingsPage />;
    default:
      return <DashboardPage />;
  }
};

export const App: React.FC = () => {
  return (
    <FleetProvider>
      <AuthProvider>
        <UIProvider>
          <AppLayout>
            <PageRenderer />
          </AppLayout>
        </UIProvider>
      </AuthProvider>
    </FleetProvider>
  );
};

export default App;
