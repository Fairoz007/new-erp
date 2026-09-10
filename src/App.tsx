import React from 'react';
import { FleetProvider } from './context/FleetContext';
import { AuthProvider } from './context/AuthContext';
import { UIProvider, useUI } from './context/UIContext';
import { AppLayout } from './components/layout/AppLayout';

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
  const { currentPage } = useUI();

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
