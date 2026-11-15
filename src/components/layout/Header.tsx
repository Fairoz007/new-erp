import React, { useEffect, useRef, useState } from 'react';
import {
  Menu,
  Search,
  Plus,
  Bell,
  LayoutGrid,
  Coins,
  ChevronDown,
  Check,
  Car,
  Wrench,
  Receipt,
  FileText,
  Droplet,
  AlertTriangle,
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useFleet } from '../../context/FleetContext';
import { useUnreadNotificationCount } from '../../services/queries-dashboards';
import { useUI, QuickModalType, AppPage } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from './UserAvatar';
import { AllOfficesBadge, OfficeBadge, useOfficeLogoUrls } from '../common/OfficeBadge';

interface QuickAddItem {
  type: Exclude<QuickModalType, null>;
  label: string;
  icon: React.ElementType;
  iconClass: string;
  page: AppPage;
  module: string;
}

const QUICK_ADD_GROUPS: { title: string; items: QuickAddItem[] }[] = [
  {
    title: 'Fleet & Workshop',
    items: [
      { type: 'add-vehicle', label: 'Add Vehicle', icon: Car, iconClass: 'text-brand-500', page: 'vehicles', module: 'vehicles' },
      { type: 'add-maintenance', label: 'Record Maintenance', icon: Wrench, iconClass: 'text-brand-500', page: 'maintenance', module: 'maintenance' },
      { type: 'add-work-order', label: 'Create Work Order', icon: Wrench, iconClass: 'text-amber-500', page: 'work-orders', module: 'work-orders' },
      { type: 'add-oil-change', label: 'Record Oil Service', icon: Droplet, iconClass: 'text-amber-500', page: 'oil-management', module: 'oil' },
      { type: 'add-accident', label: 'Report Accident', icon: AlertTriangle, iconClass: 'text-rose-500', page: 'accidents', module: 'accidents' },
    ],
  },
  {
    title: 'Finance & Docs',
    items: [
      { type: 'add-expense', label: 'Add Expense', icon: Receipt, iconClass: 'text-brand-500', page: 'expenses', module: 'expenses' },
      { type: 'add-invoice', label: 'Create Invoice', icon: FileText, iconClass: 'text-brand-500', page: 'invoices', module: 'invoices' },
      { type: 'upload-document', label: 'Upload Document', icon: Upload, iconClass: 'text-blue-500', page: 'documents', module: 'documents' },
    ],
  },
];

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onToggleSidebar, isSidebarCollapsed }) => {
  const headerRef = useRef<HTMLElement>(null);
  const { companies, selectedCompanyId, setSelectedCompanyId, currency } = useFleet();
  const { setIsSearchOpen, setIsNotificationDrawerOpen, openQuickModal, setCurrentPage } = useUI();
  const { currentUser, signOut, canAccessPage, hasPermission } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  // counted in the database (no row cap); shared cache entry with the sidebar badge
  const unreadCount = useUnreadNotificationCount().data ?? 0;
  const currentCompany = companies.find(c => c.id === selectedCompanyId);
  const officeCodes = companies.map(c => c.code);
  const officeLogo = useOfficeLogoUrls(companies.map(c => c.logo));
  const { isSuperAdmin } = useAuth();
  // the combined view is offered to users who can see more than one office
  const canSeeAll = isSuperAdmin || !!currentUser.allOffices || companies.length > 1;

  useEffect(() => {
    const closeMenus = () => {
      setIsCompanyDropdownOpen(false);
      setIsQuickAddOpen(false);
      setIsUserDropdownOpen(false);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) closeMenus();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (e) {
      setSignOutError((e as Error).message);
      setIsSigningOut(false);
    }
  };

  // Quick-add entries only for modules the user can create in (UIContext re-checks on open).
  const canQuickAdd = (page: AppPage, module: string) =>
    canAccessPage(page) && hasPermission('create', module);

  const anyQuickAdd = QUICK_ADD_GROUPS.some(g => g.items.some(item => canQuickAdd(item.page, item.module)));

  const handleQuickAddSelect = (type: QuickModalType) => {
    setIsQuickAddOpen(false);
    openQuickModal(type);
  };

  return (
    <header
      ref={headerRef}
      className="h-[72px] px-5 sm:px-8 bg-white border-b border-slate-700/80 flex items-center justify-between gap-3 sticky top-0 z-30 shrink-0 w-full"
    >
      {/* Left Area: Toggle & Search or Branch */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-xl">
        <button
          onClick={onOpenMobileMenu}
          className="w-11 h-11 sm:w-10 sm:h-10 shrink-0 rounded-full border border-slate-700 bg-white hover:bg-slate-850 flex items-center justify-center text-slate-500 hover:text-slate-900 lg:hidden cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" aria-hidden="true" />
        </button>

        <button
          onClick={onToggleSidebar}
          className="hidden lg:inline-flex items-center justify-center w-10 h-10 rounded-full border border-slate-700 bg-white hover:bg-slate-850 text-slate-500 hover:text-slate-900 transition-colors"
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        {/* Global search: a pill with the shortcut from 640 px, an icon button on phones */}
        <div className="flex-1 min-w-0 max-w-md hidden sm:block">
          <button
            onClick={() => setIsSearchOpen(true)}
            aria-label="Search vehicles, VIN, accounts"
            aria-keyshortcuts="Meta+K Control+K"
            className="w-full h-11 px-4 rounded-full bg-slate-850 border border-slate-700 hover:border-brand-500/40 hover:bg-white text-sm text-slate-400 flex items-center justify-between transition-colors cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-brand-500 transition-colors shrink-0" aria-hidden="true" />
              <span className="truncate text-slate-400">Search vehicles, VIN, accounts...</span>
            </div>
            <kbd className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-white rounded-md border border-slate-700 text-slate-400 font-mono shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>
        <button
          onClick={() => setIsSearchOpen(true)}
          aria-label="Search"
          className="sm:hidden w-11 h-11 shrink-0 rounded-full border border-slate-700 bg-white flex items-center justify-center text-slate-500 cursor-pointer"
        >
          <Search className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Right Area: Actions, Branch Switcher, Currency, Notifications, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Office switcher: every screen size. Logo or code badge, name and code; All offices; Offices screen. */}
        <div className="relative">
          <button
            onClick={() => {
              setIsCompanyDropdownOpen(prev => !prev);
              setIsQuickAddOpen(false);
              setIsUserDropdownOpen(false);
            }}
            aria-label={`Office: ${selectedCompanyId === 'all' ? 'All offices' : currentCompany?.name ?? 'none'}. Change office`}
            aria-haspopup="menu"
            aria-expanded={isCompanyDropdownOpen}
            className="flex h-11 sm:h-10 items-center gap-2 pl-1 pr-1 sm:pr-3 rounded-full bg-white hover:bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-100 transition-colors cursor-pointer select-none shadow-2xs"
          >
            {selectedCompanyId === 'all' || !currentCompany
              ? <AllOfficesBadge size="sm" />
              : <OfficeBadge office={currentCompany} allCodes={officeCodes} logoUrl={officeLogo(currentCompany.logo)} size="sm" />}
            <span className="hidden md:inline max-w-[160px] truncate">
              {selectedCompanyId === 'all' ? 'All offices' : currentCompany?.name || 'Office'}
            </span>
            <ChevronDown className="hidden sm:block w-3 h-3 text-slate-400 shrink-0" aria-hidden="true" />
          </button>

          {isCompanyDropdownOpen && (
            <div role="menu" aria-label="Offices" className="fixed left-4 right-4 top-[76px] max-h-[calc(100dvh-6rem)] overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:max-h-[70vh] mt-0 sm:mt-2 sm:w-80 bg-white border border-slate-700 rounded-2xl shadow-elevated z-40 p-2 text-xs">
              {canSeeAll && (
                <button
                  role="menuitemradio"
                  aria-checked={selectedCompanyId === 'all'}
                  onClick={() => { setSelectedCompanyId('all'); setIsCompanyDropdownOpen(false); }}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    selectedCompanyId === 'all' ? 'bg-brand-100 text-brand-600' : 'text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <AllOfficesBadge size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">All offices</span>
                    <span className="block text-2xs text-slate-400">Combined figures of the offices you can open</span>
                  </span>
                  {selectedCompanyId === 'all' && <Check className="w-4 h-4 text-brand-500 shrink-0" aria-hidden="true" />}
                </button>
              )}
              {companies.length === 0 && (
                <p className="px-3 py-2.5 text-[11px] text-slate-400">No offices assigned to your account yet.</p>
              )}
              {companies.map(comp => (
                <button
                  key={comp.id}
                  role="menuitemradio"
                  aria-checked={selectedCompanyId === comp.id}
                  onClick={() => { setSelectedCompanyId(comp.id); setIsCompanyDropdownOpen(false); }}
                  className={`w-full min-h-[44px] flex items-center gap-3 px-2.5 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                    selectedCompanyId === comp.id ? 'bg-brand-100 text-brand-600' : 'text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <OfficeBadge office={comp} allCodes={officeCodes} logoUrl={officeLogo(comp.logo)} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold truncate">{comp.name}</span>
                    <span className="block text-2xs text-slate-400 truncate">{[comp.code, comp.city].filter(Boolean).join(' · ')}</span>
                  </span>
                  {selectedCompanyId === comp.id && <Check className="w-4 h-4 text-brand-500 shrink-0" aria-hidden="true" />}
                </button>
              ))}
              {canAccessPage('offices') && <div className="my-1 border-t border-slate-700" />}
              {canAccessPage('offices') && <button
                role="menuitem"
                onClick={() => { setIsCompanyDropdownOpen(false); setCurrentPage('offices'); }}
                className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-brand-600 font-semibold hover:bg-slate-850 cursor-pointer"
              >
                <LayoutGrid className="w-4 h-4" aria-hidden="true" /> Offices overview
              </button>}
            </div>
          )}
        </div>

        {/* Base currency (organization setting; amounts are never converted) */}
        <div
          className="hidden sm:flex h-10 items-center gap-1.5 px-3 rounded-full bg-white border border-slate-700 text-xs font-bold text-slate-100 shadow-2xs"
          title="Organization base currency (Settings → Organization)"
        >
          <Coins className="w-3.5 h-3.5 text-warning shrink-0" />
          <span>{currency}</span>
        </div>

        {/* Primary Green Quick Action Button (hidden when the role cannot create any of its entries) */}
        {anyQuickAdd && <div className="relative">
          <Button
            variant="primary"
            size="sm"
            className="h-11 sm:h-10 px-4"
            aria-label="Open quick actions"
            aria-expanded={isQuickAddOpen}
            onClick={() => {
              setIsQuickAddOpen(prev => !prev);
              setIsCompanyDropdownOpen(false);
              setIsUserDropdownOpen(false);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            <span className="hidden sm:inline">Add Entry</span>
          </Button>

          {isQuickAddOpen && (
            <div className="fixed left-4 right-4 top-[76px] max-h-[calc(100dvh-6rem)] overflow-y-auto sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:max-h-[70vh] mt-0 sm:mt-2 sm:w-60 bg-white border border-slate-700 rounded-2xl shadow-elevated z-40 p-2 text-xs space-y-0.5">
              {QUICK_ADD_GROUPS.map((group, gi) => {
                const items = group.items.filter(item => canQuickAdd(item.page, item.module));
                if (items.length === 0) return null;
                return (
                  <React.Fragment key={group.title}>
                    {gi > 0 && <div className="my-1 border-t border-slate-700" />}
                    <p className="px-2.5 py-1.5 font-bold text-slate-400 uppercase text-[10px] tracking-wider">{group.title}</p>
                    {items.map(item => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.type}
                          onClick={() => handleQuickAddSelect(item.type)}
                          className="w-full min-h-[44px] sm:min-h-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${item.iconClass}`} />
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>}

        {/* Notifications */}
        <button
          onClick={() => setIsNotificationDrawerOpen(true)}
          className="relative w-11 h-11 sm:w-10 sm:h-10 shrink-0 rounded-full border border-slate-700 bg-white hover:bg-slate-850 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          title="System Notifications"
        >
          <Bell className="w-4 h-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </button>

        {/* Signed-in user: name, role, sign out */}
        <div className="relative">
          <button
            onClick={() => {
              setIsUserDropdownOpen(prev => !prev);
              setIsCompanyDropdownOpen(false);
              setIsQuickAddOpen(false);
            }}
            className="flex h-11 shrink-0 items-center gap-3 pl-1 pr-2 rounded-full bg-white hover:bg-slate-850 border border-slate-700 transition-all cursor-pointer shadow-2xs"
            title="Account"
            aria-label="Open account menu"
            aria-expanded={isUserDropdownOpen}
          >
            <UserAvatar name={currentUser.name} src={currentUser.avatar} className="ring-1 ring-slate-700/60" />
            <div className="hidden lg:block text-left pr-1">
              <p className="text-xs font-extrabold text-slate-100 leading-none truncate max-w-[140px]">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400 font-medium leading-tight mt-1 truncate max-w-[140px]">{currentUser.role}</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
          </button>

          {isUserDropdownOpen && (
            <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-6rem)] overflow-y-auto bg-white border border-slate-700 rounded-2xl shadow-elevated z-40 p-2 text-xs">
              <div className="px-3 py-2 border-b border-slate-700 mb-1 flex items-center gap-2.5">
                <UserAvatar name={currentUser.name} src={currentUser.avatar} />
                <div className="min-w-0">
                  <p className="font-bold text-slate-100 text-xs truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
                  <p className="text-[10px] text-brand-500 font-semibold truncate">
                    {currentUser.role}
                    {currentUser.department ? ` • ${currentUser.department}` : ''}
                  </p>
                </div>
              </div>
              {signOutError && <p className="px-3 py-1.5 text-[11px] text-rose-600">{signOutError}</p>}
              <button
                onClick={() => void handleSignOut()}
                disabled={isSigningOut}
                className="w-full min-h-[44px] sm:min-h-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <LogOut className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
