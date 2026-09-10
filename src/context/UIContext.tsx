import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

import { PayslipModalData } from '../types/hr';

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

const UIContext = createContext<UIContextType | undefined>(undefined);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [selectedVehicleTab, setSelectedVehicleTab] = useState<VehicleTab>('overview');
  
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [quickModal, setQuickModal] = useState<QuickModalType>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);

  // Bill attachment preview
  const [viewingBill, setViewingBill] = useState<{ url: string; title: string; type?: string; size?: string } | null>(null);
  
  // Payslip preview
  const [viewingPayslip, setViewingPayslip] = useState<PayslipModalData | null>(null);
  
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

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

  const openVehicleDetail = (vehicleId: string, tab: VehicleTab = 'overview') => {
    setSelectedVehicleId(vehicleId);
    setSelectedVehicleTab(tab);
    setCurrentPage('vehicle-detail');
  };

  const openQuickModal = (type: QuickModalType) => setQuickModal(type);
  const closeQuickModal = () => setQuickModal(null);

  const openInvoiceModal = (invoiceId: string) => setViewingInvoiceId(invoiceId);
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
