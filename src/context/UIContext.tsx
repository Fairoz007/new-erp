import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

import { PayslipModalData } from '../types/hr';
import { useAuth } from './AuthContext';

export type AppPage =
  | 'dashboard'
  | 'companies'
  | 'vehicles'
  | 'vehicle-detail'
  | 'maintenance'
  | 'work-orders'
  | 'oil-management'
  | 'tyre-management'
  | 'accidents'
  | 'expenses'
  | 'suppliers'
  | 'customers'
  | 'invoices'
  | 'reconciliation'
  | 'payments'
  | 'accounting'
  | 'trial-balance'
  | 'general-ledger'
  | 'profit-loss'
  | 'balance-sheet'
  | 'depreciation'
  | 'fixed-assets'
  | 'payroll'
  | 'profitability'
  | 'documents'
  | 'notifications'
  | 'users-roles'
  | 'approvals'
  | 'audit-logs'
  | 'reports'
  | 'settings';

export type VehicleTab =
  | 'overview'
  | 'maintenance'
  | 'oil'
  | 'tyres'
  | 'accidents'
  | 'expenses'
  | 'invoices'
  | 'depreciation'
  | 'documents'
  | 'timeline';

export type QuickModalType =
  | 'add-vehicle'
  | 'add-maintenance'
  | 'add-work-order'
  | 'add-oil-change'
  | 'add-tyre'
  | 'add-accident'
  | 'add-expense'
  | 'add-supplier'
  | 'add-customer'
  | 'add-invoice'
  | 'add-payment'
  | 'add-journal-entry'
  | 'add-fixed-asset'
  | 'upload-document'
  | 'add-employee'
  | 'run-payroll'
  | 'run-depreciation'
  | null;

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export type InvoiceView = 'all' | 'pending' | 'overdue' | 'approval' | 'draft' | 'paid';

interface UIContextType {
  currentPage: AppPage;
  setCurrentPage: (page: AppPage) => void;
  selectedVehicleId: string | null;
  selectedVehicleTab: VehicleTab;
  openVehicleDetail: (vehicleId: string, tab?: VehicleTab) => void;
  setSelectedVehicleTab: (tab: VehicleTab) => void;
  
  // Modals & Drawers
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;
  isNotificationDrawerOpen: boolean;
  setIsNotificationDrawerOpen: (open: boolean) => void;
  quickModal: QuickModalType;
  openQuickModal: (type: QuickModalType) => void;
  closeQuickModal: () => void;

  // Invoices register: pre-selected view when arriving from a dashboard card, and one-click settle
  ledgerFocus: string | null;
  openLedgerFor: (accountCode: string | null) => void;
  invoiceView: InvoiceView;
  setInvoiceView: (view: InvoiceView) => void;
  paymentInvoiceId: string | null;
  openPaymentFor: (invoiceId: string) => void;

  // Printable Invoice
  viewingInvoiceId: string | null;
  openInvoiceModal: (invoiceId: string) => void;
  closeInvoiceModal: () => void;

  // Bill & Attachment Viewer Modal
  viewingBill: { url: string; title: string; type?: string; size?: string } | null;
  openBillModal: (url: string, title: string, type?: string, size?: string) => void;
  closeBillModal: () => void;

  // Printable Payslip Modal
  viewingPayslip: PayslipModalData | null;
  openPayslipModal: (data: PayslipModalData) => void;
  closePayslipModal: () => void;
  
  // Toast notifications
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
}

const VALID_PAGES: AppPage[] = [
  'dashboard', 'companies', 'vehicles', 'vehicle-detail', 'maintenance',
  'work-orders', 'oil-management', 'tyre-management', 'accidents', 'expenses',
  'suppliers', 'customers', 'invoices', 'reconciliation', 'payments',
  'accounting', 'trial-balance', 'general-ledger', 'profit-loss', 'balance-sheet',
  'depreciation', 'fixed-assets', 'payroll', 'profitability', 'documents',
  'notifications', 'users-roles', 'approvals', 'audit-logs', 'reports', 'settings',
];

const parseLocationHash = (): { page: AppPage; vehicleId?: string; tab?: VehicleTab } => {
  if (typeof window === 'undefined') return { page: 'dashboard' };
  const rawHash = window.location.hash.replace(/^#\/?/, '');
  if (!rawHash) return { page: 'dashboard' };

  const [pagePart, queryPart] = rawHash.split('?');
  const matchedPage = VALID_PAGES.includes(pagePart as AppPage) ? (pagePart as AppPage) : 'dashboard';

  let vehicleId: string | undefined;
  let tab: VehicleTab | undefined;

  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    vehicleId = params.get('id') || undefined;
    tab = (params.get('tab') as VehicleTab) || undefined;
  }

  return { page: matchedPage, vehicleId, tab };
};

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { canAccessPage, hasPermission } = useAuth();
  const initialNav = parseLocationHash();
  const [currentPage, setCurrentPageState] = useState<AppPage>(initialNav.page);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(initialNav.vehicleId || null);
  const [selectedVehicleTab, setSelectedVehicleTab] = useState<VehicleTab>(initialNav.tab || 'overview');
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [quickModal, setQuickModal] = useState<QuickModalType>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);

  // Bill attachment preview
  const [viewingBill, setViewingBill] = useState<{ url: string; title: string; type?: string; size?: string } | null>(null);
  
  // Payslip preview
  const [viewingPayslip, setViewingPayslip] = useState<PayslipModalData | null>(null);
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Hash-based router listener
  useEffect(() => {
    const handleHashChange = () => {
      const parsed = parseLocationHash();
      setCurrentPageState(canAccessPage(parsed.page) ? parsed.page : 'dashboard');
      if (parsed.vehicleId) setSelectedVehicleId(parsed.vehicleId);
      if (parsed.tab) setSelectedVehicleTab(parsed.tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [canAccessPage]);

  // Keyboard shortcut for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsNotificationDrawerOpen(false);
        setQuickModal(null);
        setViewingInvoiceId(null);
        setViewingBill(null);
        setViewingPayslip(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const setCurrentPage = (page: AppPage) => {
    setCurrentPageState(page);
    if (typeof window !== 'undefined') {
      if (page === 'vehicle-detail' && selectedVehicleId) {
        window.location.hash = `#vehicle-detail?id=${selectedVehicleId}&tab=${selectedVehicleTab}`;
      } else {
        window.location.hash = `#${page}`;
      }
    }
  };

  const openVehicleDetail = (vehicleId: string, tab: VehicleTab = 'overview') => {
    setSelectedVehicleId(vehicleId);
    setSelectedVehicleTab(tab);
    setCurrentPageState('vehicle-detail');
    if (typeof window !== 'undefined') {
      window.location.hash = `#vehicle-detail?id=${vehicleId}&tab=${tab}`;
    }
  };

  // Quick actions bypass page routing, so enforce page access + create permission here
  const QUICK_MODAL_ACCESS: Record<string, [AppPage, string]> = {
    'add-vehicle': ['vehicles', 'vehicles'],
    'add-maintenance': ['maintenance', 'maintenance'],
    'add-work-order': ['work-orders', 'work-orders'],
    'add-oil-change': ['oil-management', 'oil'],
    'add-tyre': ['tyre-management', 'tyres'],
    'add-expense': ['expenses', 'expenses'],
    'add-accident': ['accidents', 'accidents'],
    'add-invoice': ['invoices', 'invoices'],
    'add-payment': ['payments', 'payments'],
    'add-supplier': ['suppliers', 'suppliers'],
    'add-customer': ['customers', 'customers'],
    'upload-document': ['documents', 'documents'],
    'add-employee': ['payroll', 'payroll'],
    'run-payroll': ['payroll', 'payroll'],
    'run-depreciation': ['depreciation', 'accounting'],
    'add-fixed-asset': ['fixed-assets', 'accounting'],
  };
  const openQuickModal = (type: QuickModalType) => {
    const access = type ? QUICK_MODAL_ACCESS[type] : undefined;
    if (access && (!canAccessPage(access[0]) || !hasPermission('create', access[1]))) {
      addToast({ type: 'error', title: 'Permission denied', message: 'Your role cannot perform this action.' });
      return;
    }
    setQuickModal(type);
  };
  const closeQuickModal = () => { setQuickModal(null); setPaymentInvoiceId(null); };
  const [invoiceView, setInvoiceView] = useState<InvoiceView>('all');
  const [ledgerFocus, setLedgerFocus] = useState<string | null>(null);
  const openLedgerFor = (accountCode: string | null) => {
    setLedgerFocus(accountCode);
    if (accountCode) setCurrentPage('general-ledger');
  };
  const [paymentInvoiceId, setPaymentInvoiceId] = useState<string | null>(null);
  const openPaymentFor = (invoiceId: string) => {
    if (!canAccessPage('payments') || !hasPermission('create', 'payments')) {
      addToast({ type: 'error', title: 'Permission denied', message: 'Your role cannot record payments.' });
      return;
    }
    setPaymentInvoiceId(invoiceId);
    setQuickModal('add-payment');
  };

  const openInvoiceModal = (invoiceId: string) => {
    if (!canAccessPage('invoices')) {
      addToast({ type: 'error', title: 'Permission denied', message: 'Your role cannot view invoices.' });
      return;
    }
    setViewingInvoiceId(invoiceId);
  };
  const closeInvoiceModal = () => setViewingInvoiceId(null);

  const openBillModal = (url: string, title: string, type?: string, size?: string) => {
    setViewingBill({ url, title, type, size });
  };
  const closeBillModal = () => setViewingBill(null);

  const openPayslipModal = (data: PayslipModalData) => setViewingPayslip(data);
  const closePayslipModal = () => setViewingPayslip(null);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newToast: ToastMessage = { ...toast, id };
    setToasts(prev => [...prev, newToast]);

    setTimeout(() => {
      removeToast(id);
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <UIContext.Provider
      value={{
        currentPage,
        setCurrentPage,
        selectedVehicleId,
        selectedVehicleTab,
        openVehicleDetail,
        setSelectedVehicleTab,
        isSearchOpen,
        setIsSearchOpen,
        isNotificationDrawerOpen,
        setIsNotificationDrawerOpen,
        quickModal,
        openQuickModal,
        closeQuickModal,
        invoiceView,
        setInvoiceView,
        ledgerFocus,
        openLedgerFor,
        paymentInvoiceId,
        openPaymentFor,
        viewingInvoiceId,
        openInvoiceModal,
        closeInvoiceModal,
        viewingBill,
        openBillModal,
        closeBillModal,
        viewingPayslip,
        openPayslipModal,
        closePayslipModal,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) throw new Error('useUI must be used within a UIProvider');
  return context;
};
