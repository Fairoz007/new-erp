import React, { useEffect, useState, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GlobalSearchModal } from '../common/GlobalSearchModal';
import { NotificationDrawer } from '../common/NotificationDrawer';
import { QuickActionModals } from '../common/QuickActionModals';
import { PrintableInvoiceModal } from '../common/PrintableInvoiceModal';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { PrintablePayslipModal } from '../common/PrintablePayslipModal';
import { ToastContainer } from '../common/ToastContainer';

export const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMobileMenuOpen]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed(value => !value)}
      />

      {/* Main Content Area */}
      <div className={`${isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'} min-w-0 flex flex-col min-h-screen transition-[padding] duration-200`}>
        {/* Header */}
        <Header
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onToggleSidebar={() => setIsSidebarCollapsed(value => !value)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Page Content */}
        <main className="flex-1 min-w-0 w-full px-4 py-5 sm:px-6 sm:py-6 xl:px-8 2xl:px-10 2xl:py-8 space-y-6">
          {children}
        </main>
      </div>

      {/* Global Modals & Notifications */}
      <GlobalSearchModal />
      <NotificationDrawer />
      <QuickActionModals />
      <PrintableInvoiceModal />
      <DocumentViewerModal />
      <PrintablePayslipModal />
      <ToastContainer />
    </div>
  );
};
