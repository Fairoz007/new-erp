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
    <div className="min-h-screen w-full bg-white text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-[#DCEFE5] selection:text-[#06452F]">
      {/* Sidebar - Flush to left edge of screen */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed(value => !value)}
      />

      {/* Main Content Workspace Area - Occupies full remaining width and height */}
      <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-white">
        {/* Header - Stretches from sidebar to right viewport edge */}
        <Header
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onToggleSidebar={() => setIsSidebarCollapsed(value => !value)}
          isSidebarCollapsed={isSidebarCollapsed}
        />

        {/* Page Content - Full width with balanced internal padding */}
        <main className="flex-1 min-w-0 w-full px-5 py-6 sm:px-8 sm:py-8 space-y-6 bg-white">
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
