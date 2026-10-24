import React from 'react';
import {
  LayoutDashboard,
  Building2,
  Car,
  Wrench,
  ClipboardList,
  Droplet,
  Disc,
  AlertTriangle,
  Receipt,
  Truck,
  Users,
  FileText,
  GitCompare,
  CreditCard,
  BookOpen,
  TrendingUp,
  Scale,
  FolderOpen,
  Bell,
  UserCheck,
  CheckSquare,
  History,
  BarChart3,
  Settings,
  Sparkles,
  ChevronRight,
  Layers,
  Lock,
  Smartphone,
  Shield,
} from 'lucide-react';
import { AppPage, useUI } from '../../context/UIContext';
import { useFleet } from '../../context/FleetContext';
import { useAuth } from '../../context/AuthContext';
import { Badge } from '../ui/Badge';

interface NavItem {
  id: AppPage;
  label: string;
  icon: React.ElementType;
  badge?: number | string;
  badgeColor?: 'emerald' | 'amber' | 'rose' | 'blue' | 'indigo';
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isMobileOpen = false,
  onCloseMobile,
  isCollapsed = false,
}) => {
  const { currentPage, setCurrentPage } = useUI();
  const { notifications, approvalRequests, workOrders, invoices } = useFleet();
  const { currentUser, canAccessPage } = useAuth();

  const unreadNotifs = notifications.filter(n => !n.read).length;
  const pendingApprovals = approvalRequests.filter(a => a.status === 'Pending').length;
  const overdueInvoices = invoices.filter(i => i.paymentStatus === 'Overdue').length;
  const activeWorkOrders = workOrders.filter(w => ['Approved', 'Scheduled', 'In Progress', 'Waiting for Parts'].includes(w.status)).length;

  const navigationGroups: NavGroup[] = [
    {
      title: 'MENU',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'companies', label: 'Offices & Branches', icon: Building2 },
        { id: 'profitability', label: 'Fleet Profitability', icon: Sparkles },
      ],
    },
    {
      title: 'FLEET & WORKSHOP',
      items: [
        { id: 'vehicles', label: 'Vehicles Fleet', icon: Car },
        { id: 'maintenance', label: 'Maintenance Records', icon: Wrench },
        { id: 'work-orders', label: 'Work Orders', icon: ClipboardList, badge: activeWorkOrders > 0 ? activeWorkOrders : undefined, badgeColor: 'amber' },
        { id: 'oil-management', label: 'Oil Service Tracker', icon: Droplet },
        { id: 'tyre-management', label: 'Tyre Lifecycle', icon: Disc },
        { id: 'accidents', label: 'Accident Management', icon: AlertTriangle },
        { id: 'expenses', label: 'Vehicle Expenses', icon: Receipt },
        { id: 'documents', label: 'Document Repository', icon: FolderOpen },
      ],
    },
    {
      title: 'FINANCE & ACCOUNTS',
      items: [
        { id: 'invoices', label: 'Invoices & Bills', icon: FileText, badge: overdueInvoices > 0 ? `${overdueInvoices}` : undefined, badgeColor: 'rose' },
        { id: 'reconciliation', label: '3-Way Reconciliation', icon: GitCompare },
        { id: 'payments', label: 'Payments Register', icon: CreditCard },
        { id: 'trial-balance', label: 'Trial Balance', icon: Scale },
        { id: 'general-ledger', label: 'General Ledger', icon: BookOpen },
        { id: 'accounting', label: 'Finance Control', icon: Layers },
        { id: 'profit-loss', label: 'Profit & Loss', icon: TrendingUp },
        { id: 'balance-sheet', label: 'Balance Sheet', icon: Scale },
        { id: 'fixed-assets', label: 'Fixed Assets & Depr', icon: Sparkles },
      ],
    },
    {
      title: 'HUMAN RESOURCES',
      items: [
        { id: 'payroll', label: 'HR & Payroll Disbursal', icon: Users },
      ],
    },
    {
      title: 'DIRECTORIES',
      items: [
        { id: 'suppliers', label: 'Suppliers & Vendors', icon: Truck },
        { id: 'customers', label: 'Customer Accounts', icon: Users },
      ],
    },
    {
      title: 'GENERAL & SETTINGS',
      items: [
        { id: 'approvals', label: 'Approvals Queue', icon: CheckSquare, badge: pendingApprovals > 0 ? pendingApprovals : undefined, badgeColor: 'rose' },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadNotifs > 0 ? unreadNotifs : undefined, badgeColor: 'rose' },
        { id: 'reports', label: 'Reports Suite', icon: BarChart3 },
        { id: 'audit-logs', label: 'Audit Trail Logs', icon: History },
        { id: 'users-roles', label: 'Users & Roles (RBAC)', icon: UserCheck },
        { id: 'settings', label: 'Settings', icon: Settings },
      ],
    },
  ];

  const handleNavClick = (pageId: AppPage) => {
    setCurrentPage(pageId);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/30 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
          onKeyDown={e => {
            if (e.key === 'Escape') onCloseMobile?.();
          }}
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen z-40 ${
          isCollapsed ? 'lg:w-[76px]' : 'lg:w-64 xl:w-72'
        } w-72 bg-surface-secondary border-r border-slate-700 flex flex-col shrink-0 transition-[width,transform] duration-200 lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className={`h-[72px] px-5 border-b border-slate-700/80 flex items-center bg-surface-secondary shrink-0 ${isCollapsed ? 'lg:justify-center lg:px-2' : ''}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#086343] flex items-center justify-center text-white shrink-0 shadow-sm font-bold">
              <Shield className="w-5 h-5 text-white stroke-[2.2]" />
            </div>
            <div className={isCollapsed ? 'lg:hidden' : ''}>
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold text-slate-100 tracking-tight leading-none">FleetX</span>
                <span className="text-[10px] bg-[#DCEFE5] text-[#06452F] font-bold px-1.5 py-0.5 rounded-full">
                  ERP
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">Al Hakim National LLC</p>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
          {navigationGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-1">
              <h4 className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 ${isCollapsed ? 'lg:sr-only' : ''}`}>
                {group.title}
              </h4>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = currentPage === item.id || (currentPage === 'vehicle-detail' && item.id === 'vehicles');
                  const isAllowed = canAccessPage(item.id);
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={isCollapsed ? `${item.label}${!isAllowed ? ' (Restricted)' : ''}` : !isAllowed ? 'Restricted Access' : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full min-h-[42px] relative flex items-center ${isCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between px-3'} rounded-xl text-xs sm:text-[13px] transition-all group cursor-pointer ${
                        isActive
                          ? 'bg-white text-slate-100 font-bold shadow-2xs'
                          : isAllowed
                          ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 font-medium'
                          : 'text-slate-400/60 hover:text-slate-300 hover:bg-slate-800/40 font-normal'
                      }`}
                    >
                      {/* Active green vertical indicator bar on left edge */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-[#086343] rounded-r-full" />
                      )}

                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive ? 'text-[#086343]' : isAllowed ? 'text-slate-400 group-hover:text-slate-100' : 'text-slate-500'
                          }`}
                        />
                        <span className={`truncate ${isCollapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      </div>

                      <div className={`flex items-center gap-1.5 ${isCollapsed ? 'lg:hidden' : ''}`}>
                        {!isAllowed && (
                          <span title="Restricted role access">
                            <Lock className="w-3 h-3 text-slate-400 shrink-0" />
                          </span>
                        )}
                        {item.badge !== undefined ? (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isActive ? 'bg-[#086343] text-white' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Reference-Inspired Bottom Promotional / App Card */}
          <div className={`pt-2 ${isCollapsed ? 'lg:hidden' : ''}`}>
            <div className="rounded-2xl bg-gradient-to-br from-[#06452F] via-[#086343] to-[#03261a] p-4 text-white shadow-card relative overflow-hidden group">
              <div className="absolute -right-4 -bottom-6 w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
              <div className="relative z-10 space-y-2">
                <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-xs font-bold text-white tracking-tight leading-snug">Download Driver App</h5>
                  <p className="text-[10px] text-white/75 mt-0.5">Mobile dispatch, mileage logs & fuel sync</p>
                </div>
                <button
                  onClick={() => handleNavClick('documents')}
                  className="w-full bg-[#03261a]/60 hover:bg-[#03261a] text-white border border-white/20 text-[11px] font-semibold py-1.5 px-3 rounded-full transition-all text-center block cursor-pointer"
                >
                  Get Driver Portal
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* User Profile at bottom */}
        <div className={`p-3 border-t border-slate-700/80 bg-surface-secondary shrink-0 ${isCollapsed ? 'lg:px-2' : ''}`}>
          <div className={`p-2 rounded-xl bg-white border border-slate-700/80 shadow-2xs flex items-center ${isCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
              </div>
              <div className={`min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-bold text-slate-100 truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate">{currentUser.role}</p>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full bg-[#21865B] shrink-0 ${isCollapsed ? 'lg:hidden' : ''}`} title="System Online" />
          </div>

          <div className={`mt-2 px-1 text-[10px] text-slate-400 items-center justify-between ${isCollapsed ? 'lg:hidden flex' : 'flex'}`}>
            <span>Enterprise v2.4</span>
            <span className="text-[#086343] font-semibold">● Active GCC</span>
          </div>
        </div>
      </aside>
    </>
  );
};
