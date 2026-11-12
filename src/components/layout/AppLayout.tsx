import React, { useCallback, useState, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { GlobalSearchModal } from '../common/GlobalSearchModal';
import { NotificationDrawer } from '../common/NotificationDrawer';
import { QuickActionModals } from '../common/QuickActionModals';
import { PrintableInvoiceModal } from '../common/PrintableInvoiceModal';
import { DocumentViewerModal } from '../common/DocumentViewerModal';
import { PrintablePayslipModal } from '../common/PrintablePayslipModal';
import { ToastContainer } from '../common/ToastContainer';
import { useFleet } from '../../context/FleetContext';
import { ConnectionBanner } from './ConnectionBanner';

export const AppLayout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { isRefreshing, loadErrors, reload } = useFleet();
  const failed = Object.keys(loadErrors);
  const onReconnect = useCallback(() => { void reload().catch(() => undefined); }, [reload]);

  // The phone navigation drawer (Escape, focus trap and return, scroll lock) is handled in Sidebar via useDialog.
  const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

  return (
    <div className="min-h-screen w-full bg-white text-slate-100 flex flex-col lg:flex-row font-sans selection:bg-[#DCEFE5] selection:text-[#06452F]">
      {/* Keyboard users skip the navigation and header (WCAG 2.4.1) */}
      <a
        href="#main-content"
        onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-4 focus:py-3 focus:rounded-xl focus:bg-[#086343] focus:text-white focus:text-sm focus:font-semibold focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      {/* Sidebar - Flush to left edge of screen */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={closeMobileMenu}
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

        <ConnectionBanner onReconnect={onReconnect} />
        {isRefreshing && (
          <div className="h-0.5 w-full bg-[#DCEFE5] overflow-hidden" role="progressbar" aria-label="Refreshing data">
            <div className="h-full w-1/3 bg-[#086343] animate-pulse" />
          </div>
        )}
        {failed.length > 0 && !isRefreshing && (
          <div role="alert" className="px-5 sm:px-8 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-800 flex items-center justify-between gap-3">
            <span>Some data could not be loaded ({failed.slice(0, 4).join(', ')}{failed.length > 4 ? '…' : ''}). Figures may be incomplete.</span>
            <button className="font-bold underline cursor-pointer min-h-[44px] sm:min-h-0 shrink-0" onClick={() => reload(failed as any)}>Retry</button>
          </div>
        )}

        {/* Page Content - Full width with balanced internal padding */}
        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 w-full focus:outline-none px-5 py-6 sm:px-8 sm:py-8 space-y-6 bg-white">
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
