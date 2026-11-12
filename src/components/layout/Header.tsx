import React, { useEffect, useRef, useState } from 'react';
import {
  Menu,
  Search,
  Plus,
  Bell,
  Mail,
  Building2,
  Coins,
  ChevronDown,
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
      { type: 'add-vehicle', label: 'Add Vehicle', icon: Car, iconClass: 'text-[#086343]', page: 'vehicles', module: 'vehicles' },
      { type: 'add-maintenance', label: 'Record Maintenance', icon: Wrench, iconClass: 'text-[#086343]', page: 'maintenance', module: 'maintenance' },
      { type: 'add-work-order', label: 'Create Work Order', icon: Wrench, iconClass: 'text-amber-500', page: 'work-orders', module: 'work-orders' },
      { type: 'add-oil-change', label: 'Record Oil Service', icon: Droplet, iconClass: 'text-amber-500', page: 'oil-management', module: 'oil' },
      { type: 'add-accident', label: 'Report Accident', icon: AlertTriangle, iconClass: 'text-rose-500', page: 'accidents', module: 'accidents' },
    ],
  },
  {
    title: 'Finance & Docs',
    items: [
      { type: 'add-expense', label: 'Add Expense', icon: Receipt, iconClass: 'text-[#086343]', page: 'expenses', module: 'expenses' },
      { type: 'add-invoice', label: 'Create Invoice', icon: FileText, iconClass: 'text-[#086343]', page: 'invoices', module: 'invoices' },
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

        {/* Global Search Pill Bar (Exact Reference Match) */}
        <div className="flex-1 min-w-0 max-w-md">
          <button
            onClick={() => setIsSearchOpen(true)}
            aria-label="Search vehicles, VIN, accounts"
            aria-keyshortcuts="Meta+K Control+K"
            className="w-full h-11 px-4 rounded-full bg-slate-850 border border-slate-700 hover:border-forest-500/40 hover:bg-white text-xs sm:text-sm text-slate-400 flex items-center justify-between transition-all cursor-pointer group shadow-2xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search className="w-4 h-4 text-slate-400 group-hover:text-[#086343] transition-colors shrink-0" />
              <span className="truncate text-slate-400">Search vehicles, VIN, accounts...</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-white rounded-md border border-slate-700 text-slate-400 font-mono shadow-2xs">
              ⌘K
            </kbd>
          </button>
        </div>
      </div>

      {/* Right Area: Actions, Branch Switcher, Currency, Notifications, Profile */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/* Office / Branch Switcher */}
        <div className="relative hidden md:block">
          <button
            onClick={() => {
              setIsCompanyDropdownOpen(prev => !prev);
              setIsQuickAddOpen(false);
              setIsUserDropdownOpen(false);
            }}
            aria-label="Select office or branch"
            aria-expanded={isCompanyDropdownOpen}
            className="flex h-10 items-center gap-2 px-3.5 rounded-full bg-white hover:bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-100 transition-all cursor-pointer select-none shadow-2xs"
          >
            <Building2 className="w-3.5 h-3.5 text-[#086343] shrink-0" />
            <span className="max-w-[160px] truncate">
              {selectedCompanyId === 'all' ? 'All Offices' : currentCompany?.name || 'Office'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {isCompanyDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-700 rounded-2xl shadow-elevated z-40 p-2 text-xs">
              <div className="px-3 py-2 border-b border-slate-700 mb-1">
                <p className="font-bold text-slate-100 text-xs">Offices</p>
                <p className="text-[10px] text-slate-400">Offices you have access to, or the consolidated view</p>
              </div>
              <button
                onClick={() => {
                  setSelectedCompanyId('all');
                  setIsCompanyDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                  selectedCompanyId === 'all' ? 'bg-[#DCEFE5] text-[#06452F] font-bold' : 'text-slate-200 hover:bg-slate-850'
                }`}
              >
                <div>
                  <p className="font-semibold flex items-center gap-1.5">
                    <span aria-hidden="true">🏢</span> All Offices (Consolidated)
                  </p>
                  <p className="text-[10px] text-slate-400">All offices you have access to</p>
                </div>
                {selectedCompanyId === 'all' && <span className="text-[#086343] font-bold"><span aria-hidden="true">✓</span><span className="sr-only">Selected</span></span>}
              </button>

              <div className="my-1 border-t border-slate-700" />

              {companies.length === 0 && (
                <p className="px-3 py-2.5 text-[11px] text-slate-400">No offices assigned to your account yet.</p>
              )}
              {companies.map(comp => (
                <button
                  key={comp.id}
                  onClick={() => {
                    setSelectedCompanyId(comp.id);
                    setIsCompanyDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                    selectedCompanyId === comp.id ? 'bg-[#DCEFE5] text-[#06452F] font-bold' : 'text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold truncate flex items-center gap-1.5">
                      <span aria-hidden="true">📍</span>
                      <span>{comp.name}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {[comp.code, comp.city].filter(Boolean).join(' • ')}
                    </p>
                  </div>
                  {selectedCompanyId === comp.id && <span className="text-[#086343] font-bold shrink-0"><span aria-hidden="true">✓</span><span className="sr-only">Selected</span></span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Base currency (organization setting; amounts are never converted) */}
        <div
          className="hidden sm:flex h-10 items-center gap-1.5 px-3 rounded-full bg-white border border-slate-700 text-xs font-bold text-slate-100 shadow-2xs"
          title="Organization base currency (Settings → Organization)"
        >
          <Coins className="w-3.5 h-3.5 text-[#D9A441] shrink-0" />
          <span>{currency}</span>
        </div>

        {/* Primary Green Quick Action Button */}
        <div className="relative">
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
            <div className="absolute right-0 mt-2 w-60 max-w-[calc(100vw-2rem)] bg-white border border-slate-700 rounded-2xl shadow-elevated z-40 p-2 text-xs space-y-0.5">
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
              {QUICK_ADD_GROUPS.every(g => g.items.every(item => !canQuickAdd(item.page, item.module))) && (
                <p className="px-3 py-2 text-[11px] text-slate-400">Your role cannot create records.</p>
              )}
            </div>
          )}
        </div>

        {/* Circular Mail Icon Button (From Reference) */}
        <button
          onClick={() => setCurrentPage('notifications')}
          className="w-11 h-11 sm:w-10 sm:h-10 shrink-0 rounded-full border border-slate-700 bg-white hover:bg-slate-850 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
          aria-label="Messages"
          title="Messages & Inbox"
        >
          <Mail className="w-4 h-4" aria-hidden="true" />
        </button>

        {/* Circular Notification Bell Icon Button (From Reference) */}
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
            <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white border border-slate-700 rounded-2xl shadow-elevated z-40 p-2 text-xs">
              <div className="px-3 py-2 border-b border-slate-700 mb-1 flex items-center gap-2.5">
                <UserAvatar name={currentUser.name} src={currentUser.avatar} />
                <div className="min-w-0">
                  <p className="font-bold text-slate-100 text-xs truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{currentUser.email}</p>
                  <p className="text-[10px] text-[#086343] font-semibold truncate">
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
