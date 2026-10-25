import React, { useState } from 'react';
import { Bell, CheckCheck, AlertTriangle, AlertCircle, Info, CheckCircle2, ChevronRight, ExternalLink } from 'lucide-react';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatDateTime } from '../../utils/date';

export const NotificationDrawer: React.FC = () => {
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useFleet();
  const { isNotificationDrawerOpen, setIsNotificationDrawerOpen, openVehicleDetail, openInvoiceModal, setCurrentPage, addToast } = useUI();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'critical') return n.severity === 'critical';
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleAction = async (n: typeof notifications[0]) => {
    setIsNotificationDrawerOpen(false);

    if (n.type === 'approval_required') {
      setCurrentPage('approvals');
    } else if (n.vehicleId) {
      openVehicleDetail(n.vehicleId);
    } else if (n.type.includes('invoice') && n.referenceId) {
      openInvoiceModal(n.referenceId);
    }

    if (n.read) return;
    try {
      await markNotificationAsRead(n.id);
    } catch (e) {
      addToast({ type: 'error', title: 'Could not mark as read', message: (e as Error).message });
    }
  };

  const handleMarkAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await markAllNotificationsAsRead();
    } catch (e) {
      addToast({ type: 'error', title: 'Could not mark all as read', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <Drawer
      isOpen={isNotificationDrawerOpen}
      onClose={() => setIsNotificationDrawerOpen(false)}
      title={
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-indigo-400" />
          <span>Fleet Notification Center</span>
          {unreadCount > 0 && <Badge variant="rose" size="sm">{unreadCount} Unread</Badge>}
        </div>
      }
      description="Approval, expiry and payment alerts for the offices you can access"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || busy}
            leftIcon={<CheckCheck className="w-4 h-4" />}
          >
            Mark All as Read
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setIsNotificationDrawerOpen(false)}>
            Close
          </Button>
        </div>
      }
    >
      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-950/70 border border-slate-800 rounded-lg mb-4">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
            filter === 'all' ? 'bg-slate-800 text-white font-semibold shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
            filter === 'unread' ? 'bg-slate-800 text-white font-semibold shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Unread ({unreadCount})
        </button>
        <button
          onClick={() => setFilter('critical')}
          className={`flex-1 py-1 text-xs font-medium rounded transition-all cursor-pointer ${
            filter === 'critical' ? 'bg-slate-800 text-white font-semibold shadow-xs' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Critical ({notifications.filter(n => n.severity === 'critical').length})
        </button>
      </div>

      {/* Notification List */}
      <div className="space-y-2.5">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map(item => (
            <div
              key={item.id}
              onClick={() => handleAction(item)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                item.read
                  ? 'bg-slate-800/40 border-slate-800 hover:border-slate-700 text-slate-300'
                  : 'bg-slate-800/90 border-slate-700 hover:border-indigo-500/50 text-slate-100 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  {getSeverityIcon(item.severity)}
                  <div>
                    <h4 className={`text-xs font-semibold ${item.read ? 'text-slate-300' : 'text-white'}`}>
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{item.message}</p>
                    <span className="text-[10px] text-slate-400 mt-2 block">{formatDateTime(item.date)}</span>
                  </div>
                </div>
                {!item.read && <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0 mt-1" />}
              </div>
            </div>
          ))
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs">
            <CheckCheck className="w-8 h-8 mx-auto text-emerald-400 stroke-[1.5] mb-2" />
            <p className="font-semibold text-slate-300">{notifications.length === 0 ? 'No notifications yet' : 'Nothing here'}</p>
            <p className="text-slate-400 mt-0.5">{notifications.length === 0 ? 'Alerts will appear when something needs your attention.' : 'No notifications matching the selected filter.'}</p>
          </div>
        )}
      </div>
    </Drawer>
  );
};
