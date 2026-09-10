import React, { useEffect, useRef, useState } from 'react';
import {
  Menu,
  Search,
  Plus,
  Bell,
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
} from 'lucide-react';
import { Button } from '../ui/Button';
import { useFleet } from '../../context/FleetContext';
import { useUI, QuickModalType } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onToggleSidebar: () => void;
  isSidebarCollapsed: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onOpenMobileMenu, onToggleSidebar, isSidebarCollapsed }) => {
  const headerRef = useRef<HTMLElement>(null);
  const { companies, selectedCompanyId, setSelectedCompanyId, currency, setCurrency, notifications } = useFleet();
  const { setIsSearchOpen, setIsNotificationDrawerOpen, openQuickModal } = useUI();
  const { currentUser, users, setCurrentUserId } = useAuth();

  const [isCompanyDropdownOpen, setIsCompanyDropdownOpen] = useState(false);
  const [isCurrencyDropdownOpen, setIsCurrencyDropdownOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;
  const currentCompany = companies.find(c => c.id === selectedCompanyId);

  useEffect(() => {
    const closeMenus = () => {
      setIsCompanyDropdownOpen(false);
      setIsCurrencyDropdownOpen(false);
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

  const handleQuickAddSelect = (type: QuickModalType) => {
    setIsQuickAddOpen(false);
    openQuickModal(type);
  };

  return (
    <header
      ref={headerRef}
      className="h-14 bg-white border-b border-slate-700 px-3 sm:px-5 flex items-center justify-between gap-2.5 sticky top-0 z-30"
    >
      {/* Left: Mobile Toggle, Collapse Toggle, Company Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={onOpenMobileMenu}
          className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 lg:hidden cursor-pointer"
          aria-label="Open Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <button
          onClick={onToggleSidebar}
          className="hidden lg:inline-flex items-center justify-center w-8 h-8 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>

        {/* Office / Branch Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setIsCompanyDropdownOpen(prev => !prev);
              setIsCurrencyDropdownOpen(false);
              setIsQuickAddOpen(false);
              setIsUserDropdownOpen(false);
            }}
            aria-label="Select office or branch"
            aria-expanded={isCompanyDropdownOpen}
            className="flex h-9 items-center gap-1.5 px-2.5 rounded-lg bg-white hover:bg-slate-850 border border-slate-700 text-xs sm:text-sm font-medium text-slate-100 transition-colors cursor-pointer select-none"
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span className="hidden md:inline lg:hidden xl:inline max-w-[210px] truncate">
              {selectedCompanyId === 'all'
                ? 'Al Hakim National LLC (All Offices)'
                : currentCompany?.id === 'comp-1'
                ? 'Head Office (Muscat)'
                : currentCompany?.id === 'comp-2'
                ? 'Duqm Office (SEZAD)'
                : currentCompany?.name || 'Office'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {isCompanyDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-80 bg-white border border-slate-700 rounded-xl shadow-elevated z-40 p-1.5 text-xs">
              <div className="px-2.5 py-1.5 border-b border-slate-700 mb-1">
                <p className="font-bold text-slate-100 text-xs">Al Hakim National LLC</p>
                <p className="text-[10px] text-slate-400">Select active office or consolidated group view</p>
              </div>
              <button
                onClick={() => {
                  setSelectedCompanyId('all');
                  setIsCompanyDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                  selectedCompanyId === 'all' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-200 hover:bg-slate-850'
                }`}
              >
                <div>
                  <p className="font-semibold flex items-center gap-1.5">
                    <span>🏢</span> All Offices (Consolidated)
                  </p>
                  <p className="text-[10px] text-slate-400">View entire fleet, accounts & operations across both offices</p>
                </div>
                {selectedCompanyId === 'all' && <span className="text-indigo-600 font-bold">✓</span>}
              </button>

              <div className="my-1 border-t border-slate-700" />

              {companies.filter(comp => comp.id === 'comp-1' || comp.id === 'comp-2').map(comp => (
                <button
                  key={comp.id}
                  onClick={() => {
                    setSelectedCompanyId(comp.id);
                    setIsCompanyDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    selectedCompanyId === comp.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="font-semibold truncate flex items-center gap-1.5">
                      <span>📍</span>
                      <span>{comp.id === 'comp-1' ? 'Head Office (Muscat)' : comp.id === 'comp-2' ? 'Duqm Office (SEZAD)' : comp.name}</span>
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {comp.id === 'comp-1' ? 'Corporate Headquarters • Executive & Central Fleet' : 'Port of Duqm Hub • Heavy Haulage & Industrial Fleet'}
                    </p>
                  </div>
                  {selectedCompanyId === comp.id && <span className="text-indigo-600 font-bold shrink-0">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Search Bar */}
      <div className="hidden lg:flex flex-1 max-w-md mx-2">
        <button
          onClick={() => setIsSearchOpen(true)}
          className="w-full h-9 flex items-center justify-between px-3 rounded-lg bg-slate-850 border border-slate-700 hover:border-indigo-300 text-xs text-slate-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
            <span className="text-slate-400">Search vehicles, VIN, invoices, work orders...</span>
          </div>
          <kbd className="px-1.5 py-0.5 text-[10px] bg-white rounded border border-slate-700 text-slate-400 font-mono">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right: Actions, Currency, Notifications, User Switcher */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Mobile Search Icon */}
        <button
          onClick={() => setIsSearchOpen(true)}
          className="p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 lg:hidden cursor-pointer"
          aria-label="Open global search"
        >
          <Search className="w-4 h-4" />
        </button>

        {/* Currency Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setIsCurrencyDropdownOpen(prev => !prev);
              setIsCompanyDropdownOpen(false);
              setIsQuickAddOpen(false);
              setIsUserDropdownOpen(false);
            }}
            className="flex h-9 items-center gap-1.5 px-2.5 rounded-lg bg-white hover:bg-slate-850 border border-slate-700 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
            title="Switch Reporting Currency"
            aria-label="Switch reporting currency"
            aria-expanded={isCurrencyDropdownOpen}
          >
            <Coins className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{currency}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {isCurrencyDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-32 bg-white border border-slate-700 rounded-xl shadow-elevated z-40 p-1 text-xs">
              <p className="px-2 py-1 font-semibold text-slate-400 uppercase text-[10px]">Currency</p>
              {['OMR', 'USD', 'EUR', 'SAR', 'AED'].map(curr => (
                <button
                  key={curr}
                  onClick={() => {
                    setCurrency(curr);
                    setIsCurrencyDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left ${
                    currency === curr ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <span>{curr}</span>
                  {currency === curr && <span className="text-indigo-600 font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Add Menu */}
        <div className="relative">
          <Button
            variant="primary"
            size="sm"
            className="h-9 px-3"
            aria-label="Open quick actions"
            aria-expanded={isQuickAddOpen}
            onClick={() => {
              setIsQuickAddOpen(prev => !prev);
              setIsCompanyDropdownOpen(false);
              setIsCurrencyDropdownOpen(false);
              setIsUserDropdownOpen(false);
            }}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline">Quick Action</span>
          </Button>

          {isQuickAddOpen && (
            <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-700 rounded-xl shadow-elevated z-40 p-1.5 text-xs space-y-0.5">
              <p className="px-2 py-1 font-semibold text-slate-400 uppercase text-[10px]">Fleet & Workshop</p>
              <button
                onClick={() => handleQuickAddSelect('add-vehicle')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <Car className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Add New Vehicle</span>
              </button>
              <button
                onClick={() => handleQuickAddSelect('add-maintenance')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <Wrench className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                <span>Record Maintenance</span>
              </button>
              <button
                onClick={() => handleQuickAddSelect('add-work-order')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Create Work Order</span>
              </button>
              <button
                onClick={() => handleQuickAddSelect('add-oil-change')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <Droplet className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Record Oil Change</span>
              </button>
              <button
                onClick={() => handleQuickAddSelect('add-accident')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Report Accident</span>
              </button>

              <div className="my-1 border-t border-slate-700" />
              <p className="px-2 py-1 font-semibold text-slate-400 uppercase text-[10px]">Finance & Docs</p>
              <button
                onClick={() => handleQuickAddSelect('add-expense')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <Receipt className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Add Vehicle Expense</span>
              </button>
              <button
                onClick={() => handleQuickAddSelect('add-invoice')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>Create New Invoice</span>
              </button>
              <button
                onClick={() => handleQuickAddSelect('upload-document')}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-slate-200 hover:bg-slate-850 hover:text-slate-100 transition-colors cursor-pointer text-left"
              >
                <Upload className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Upload Document</span>
              </button>
            </div>
          )}
        </div>

        {/* Notifications Bell */}
        <button
          onClick={() => setIsNotificationDrawerOpen(true)}
          className="relative p-2 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white" />
          )}
        </button>

        {/* User Switcher */}
        <div className="relative">
          <button
            onClick={() => {
              setIsUserDropdownOpen(prev => !prev);
              setIsCompanyDropdownOpen(false);
              setIsCurrencyDropdownOpen(false);
              setIsQuickAddOpen(false);
            }}
            className="flex h-9 items-center gap-2 p-1 sm:px-2 rounded-lg bg-white hover:bg-slate-850 border border-slate-700 transition-colors cursor-pointer"
            title="Switch User / Role for RBAC Testing"
            aria-label="Open profile and role switcher"
            aria-expanded={isUserDropdownOpen}
          >
            <div className="w-6 h-6 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
              <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
            </div>
            <div className="hidden xl:block text-left">
              <p className="text-xs font-semibold text-slate-100 leading-none">{currentUser.name.split(' ')[0]}</p>
              <p className="text-[10px] text-slate-400 font-medium leading-tight mt-0.5">{currentUser.role}</p>
            </div>
            <ChevronDown className="w-3 h-3 text-slate-400 hidden xl:block" />
          </button>

          {isUserDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-700 rounded-xl shadow-elevated z-40 p-1.5 text-xs">
              <p className="px-2 py-1 font-semibold text-slate-400 uppercase text-[10px]">Switch Role Profile (RBAC)</p>
              <div className="max-h-60 overflow-y-auto space-y-0.5 mt-1">
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCurrentUserId(u.id);
                      setIsUserDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                      currentUser.id === u.id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                      <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs text-slate-100 truncate">{u.name}</p>
                      <p className="text-[10px] text-slate-400">{u.role} ({u.department})</p>
                    </div>
                    {currentUser.id === u.id && <span className="text-indigo-600 font-bold shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
