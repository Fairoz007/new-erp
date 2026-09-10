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
  const { currentUser } = useAuth();

  const unreadNotifs = notifications.filter(n => !n.read).length;
  const pendingApprovals = approvalRequests.filter(a => a.status === 'Pending').length;
  const overdueInvoices = invoices.filter(i => i.paymentStatus === 'Overdue').length;
  const activeWorkOrders = workOrders.filter(w => ['Approved', 'Scheduled', 'In Progress', 'Waiting for Parts'].includes(w.status)).length;

  const navigationGroups: NavGroup[] = [
    {
      title: 'Executive & Overview',
      items: [
        { id: 'dashboard', label: 'Executive Dashboard', icon: LayoutDashboard },
        { id: 'companies', label: 'Offices & Branches', icon: Building2 },
        { id: 'profitability', label: 'Vehicle Profitability', icon: Sparkles },
      ],
    },
    {
      title: 'Fleet & Workshop',
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
      title: 'Finance & Accounting',
      items: [
        { id: 'invoices', label: 'Invoices & Bills (AP / AR)', icon: FileText, badge: overdueInvoices > 0 ? `${overdueInvoices} Overdue` : undefined, badgeColor: 'rose' },
        { id: 'reconciliation', label: '3-Way Reconciliation', icon: GitCompare },
        { id: 'payments', label: 'Payments Register', icon: CreditCard },
        { id: 'trial-balance', label: 'Trial Balance', icon: Scale },
        { id: 'general-ledger', label: 'General Ledger & Sub-Ledger', icon: BookOpen },
        { id: 'accounting', label: 'Finance Control Center', icon: Layers },
        { id: 'profit-loss', label: 'Profit & Loss Statement', icon: TrendingUp },
        { id: 'balance-sheet', label: 'Balance Sheet', icon: Scale },
        { id: 'fixed-assets', label: 'Asset Module & Auto-Depr', icon: Sparkles },
      ],
    },
    {
      title: 'Human Resources & Payroll',
      items: [
        { id: 'payroll', label: 'HR & Payroll Disbursals', icon: Users },
      ],
    },
    {
      title: 'Partners & Directory',
      items: [
        { id: 'suppliers', label: 'Suppliers & Vendors', icon: Truck },
        { id: 'customers', label: 'Customer Accounts', icon: Users },
      ],
    },
    {
      title: 'Governance & Analytics',
      items: [
        { id: 'approvals', label: 'Approvals Queue', icon: CheckSquare, badge: pendingApprovals > 0 ? pendingApprovals : undefined, badgeColor: 'rose' },
        { id: 'notifications', label: 'Notification Center', icon: Bell, badge: unreadNotifs > 0 ? unreadNotifs : undefined, badgeColor: 'rose' },
        { id: 'reports', label: 'Executive Reports Suite', icon: BarChart3 },
        { id: 'audit-logs', label: 'Audit Trail Logs', icon: History },
        { id: 'users-roles', label: 'Users & Roles (RBAC)', icon: UserCheck },
        { id: 'settings', label: 'System Settings', icon: Settings },
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
          className="fixed inset-0 bg-black/20 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
          onKeyDown={e => {
            if (e.key === 'Escape') onCloseMobile?.();
          }}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 ${isCollapsed ? 'lg:w-[72px]' : 'lg:w-64 xl:w-68'} w-68 bg-white border-r border-slate-700 flex flex-col transition-[width,transform] duration-200 lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className={`h-14 border-b border-slate-700 flex items-center bg-white shrink-0 ${isCollapsed ? 'lg:justify-center lg:px-2' : 'px-4'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shrink-0 shadow-xs font-bold text-xs tracking-wider">
              AHN
            </div>
            <div className={isCollapsed ? 'lg:hidden' : ''}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-slate-100 tracking-tight leading-none">Al Hakim National</span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-1.5 py-0.2 rounded border border-indigo-100">
                  LLC
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-normal mt-0.5">Muscat HQ & Duqm Office</p>
            </div>
          </div>
        </div>

        {/* Scrollable Navigation */}
        <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 scrollbar-thin">
          {navigationGroups.map((group, groupIdx) => (
            <div key={groupIdx} className="space-y-0.5">
              <h4 className={`px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 ${isCollapsed ? 'lg:sr-only' : ''}`}>
                {group.title}
              </h4>
              <div className="space-y-0.5">
                {group.items.map(item => {
                  const isActive = currentPage === item.id || (currentPage === 'vehicle-detail' && item.id === 'vehicles');
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full h-10 flex items-center ${isCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between px-2.5'} rounded-lg text-[13px] transition-all group cursor-pointer ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100/80 shadow-2xs'
                          : 'text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-transparent font-normal'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        <span className={`truncate ${isCollapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      </div>

                      {item.badge !== undefined && !isCollapsed ? (
                        <Badge variant={item.badgeColor || 'indigo'} size="sm">
                          {item.badge}
                        </Badge>
                      ) : isActive && !isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-indigo-600/70 shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User Profile at bottom */}
        <div className={`p-2.5 border-t border-slate-700 bg-white shrink-0 ${isCollapsed ? 'lg:px-1.5' : ''}`}>
          <div className={`p-2 rounded-lg border border-slate-700/60 bg-slate-850 flex items-center ${isCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
              </div>
              <div className={`min-w-0 ${isCollapsed ? 'lg:hidden' : ''}`}>
                <p className="text-xs font-semibold text-slate-100 truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400 font-medium truncate">{currentUser.role}</p>
              </div>
            </div>
            <div className={`w-2 h-2 rounded-full bg-emerald-500 shrink-0 ${isCollapsed ? 'lg:hidden' : ''}`} title="Online" />
          </div>

          <div className={`mt-2 px-1 text-[10px] text-slate-400 items-center justify-between ${isCollapsed ? 'lg:hidden flex' : 'flex'}`}>
            <span>Enterprise v2.4 (Oman GCC)</span>
            <span className="text-emerald-700 font-mono">● Live</span>
          </div>
        </div>
      </aside>
    </>
  );
};
