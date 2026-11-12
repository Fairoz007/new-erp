import React, { useEffect, Suspense, lazy } from 'react';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { FleetProvider } from './context/FleetContext';
import { useAuth } from './context/AuthContext';
import { UIProvider, useUI } from './context/UIContext';
import { AppLayout } from './components/layout/AppLayout';
import { Button } from './components/ui/Button';
import { ErrorBoundary } from './components/layout/ErrorBoundary';

// Static Import for Immediate Paint on Landing Page
import { DashboardPage } from './pages/dashboard/DashboardPage';

// Lazy Loaded Submodules (Code-split for maximum load speed)
const PartyDetailPage = lazy(() => import('./pages/parties/PartyDetailPage').then(m => ({ default: m.PartyDetailPage })));
const CompaniesPage = lazy(() => import('./pages/companies/CompaniesPage').then(m => ({ default: m.CompaniesPage })));
const DriversPage = lazy(() => import('./pages/drivers/DriversPage').then(m => ({ default: m.DriversPage })));
const VehiclesPage = lazy(() => import('./pages/vehicles/VehiclesPage').then(m => ({ default: m.VehiclesPage })));
const VehicleDetailPage = lazy(() => import('./pages/vehicles/VehicleDetailPage').then(m => ({ default: m.VehicleDetailPage })));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage').then(m => ({ default: m.MaintenancePage })));
const WorkOrdersPage = lazy(() => import('./pages/maintenance/WorkOrdersPage').then(m => ({ default: m.WorkOrdersPage })));
const OilManagementPage = lazy(() => import('./pages/oil-management/OilManagementPage').then(m => ({ default: m.OilManagementPage })));
const TyreManagementPage = lazy(() => import('./pages/tyre-management/TyreManagementPage').then(m => ({ default: m.TyreManagementPage })));
const AccidentsPage = lazy(() => import('./pages/accidents/AccidentsPage').then(m => ({ default: m.AccidentsPage })));
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage').then(m => ({ default: m.ExpensesPage })));
const SuppliersPage = lazy(() => import('./pages/suppliers/SuppliersPage').then(m => ({ default: m.SuppliersPage })));
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage').then(m => ({ default: m.CustomersPage })));
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage').then(m => ({ default: m.InvoicesPage })));
const ReconciliationPage = lazy(() => import('./pages/reconciliation/ReconciliationPage').then(m => ({ default: m.ReconciliationPage })));
const PaymentsPage = lazy(() => import('./pages/payments/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
const AccountingPage = lazy(() => import('./pages/accounting/AccountingPage').then(m => ({ default: m.AccountingPage })));
const TrialBalancePage = lazy(() => import('./pages/accounting/TrialBalancePage').then(m => ({ default: m.TrialBalancePage })));
const GeneralLedgerPage = lazy(() => import('./pages/accounting/GeneralLedgerPage').then(m => ({ default: m.GeneralLedgerPage })));
const ProfitLossPage = lazy(() => import('./pages/profit-loss/ProfitLossPage').then(m => ({ default: m.ProfitLossPage })));
const BalanceSheetPage = lazy(() => import('./pages/balance-sheet/BalanceSheetPage').then(m => ({ default: m.BalanceSheetPage })));
const DepreciationPage = lazy(() => import('./pages/depreciation/DepreciationPage').then(m => ({ default: m.DepreciationPage })));
const AssetModulePage = lazy(() => import('./pages/depreciation/AssetModulePage').then(m => ({ default: m.AssetModulePage })));
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage').then(m => ({ default: m.PayrollPage })));
const VehicleProfitabilityPage = lazy(() => import('./pages/profitability/VehicleProfitabilityPage').then(m => ({ default: m.VehicleProfitabilityPage })));
const DocumentsPage = lazy(() => import('./pages/documents/DocumentsPage').then(m => ({ default: m.DocumentsPage })));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const UsersRolesPage = lazy(() => import('./pages/users-roles/UsersRolesPage').then(m => ({ default: m.UsersRolesPage })));
const ApprovalsPage = lazy(() => import('./pages/approvals/ApprovalsPage').then(m => ({ default: m.ApprovalsPage })));
const AuditLogsPage = lazy(() => import('./pages/audit-logs/AuditLogsPage').then(m => ({ default: m.AuditLogsPage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })));

/** Non-blocking sleek skeleton displayed during lazy chunk transitions */
const PageSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse p-4 sm:p-6" role="status" aria-label="Loading section">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
      <div className="space-y-2">
        <div className="h-7 w-48 bg-slate-800/80 rounded-lg" />
        <div className="h-4 w-72 bg-slate-800/50 rounded" />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-9 w-24 bg-slate-800/60 rounded-lg" />
        <div className="h-9 w-32 bg-slate-800/80 rounded-lg" />
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-24 bg-slate-800/40 border border-slate-800/80 rounded-xl p-4 space-y-3">
          <div className="h-3 w-20 bg-slate-700/50 rounded" />
          <div className="h-6 w-28 bg-slate-700/80 rounded" />
        </div>
      ))}
    </div>
    <div className="h-80 bg-slate-800/25 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-center items-center gap-3">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs text-slate-400">Loading module...</span>
    </div>
  </div>
);

const PageRenderer: React.FC = () => {
  const { currentPage, setCurrentPage } = useUI();
  const { canAccessPage, currentUser } = useAuth();

  const allowed = canAccessPage(currentPage);
  // Deep link / stale page the role can't open: land on the dashboard instead of a dead end
  useEffect(() => { if (!allowed) setCurrentPage('dashboard'); }, [allowed, setCurrentPage]);

  if (!allowed) {
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

  return (
    <Suspense fallback={<PageSkeleton />}>
      {(() => {
        switch (currentPage) {
          case 'dashboard':
            return <DashboardPage />;
          case 'companies':
            return <CompaniesPage />;
          case 'vehicles':
            return <VehiclesPage />;
          case 'drivers':
            return <DriversPage />;
          case 'vehicle-detail':
            return <VehicleDetailPage />;
          case 'customer-detail':
            return <PartyDetailPage kind="customer" />;
          case 'supplier-detail':
            return <PartyDetailPage kind="supplier" />;
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
      })()}
    </Suspense>
  );
};

const GuardedPage: React.FC = () => {
  const { currentPage } = useUI();
  return (
    <ErrorBoundary resetKey={currentPage}>
      <PageRenderer />
    </ErrorBoundary>
  );
};

export const App: React.FC = () => {
  return (
    // AuthProvider + AuthGate wrap the app in main.tsx; data loads only after sign-in
    <FleetProvider>
      <UIProvider>
        <AppLayout>
          <GuardedPage />
        </AppLayout>
      </UIProvider>
    </FleetProvider>
  );
};

export default App;
