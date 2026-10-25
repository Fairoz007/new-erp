import React, { useState } from 'react';
import { Bell, CheckCheck, AlertCircle, AlertTriangle, Info, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/date';

export const NotificationsPage: React.FC = () => {
  // refreshExpiryNotifications: new FleetContext function (wraps services/system.refreshExpiryNotifications, affects ['notifications'])
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead, refreshExpiryNotifications } = useFleet();
  const { openVehicleDetail, openInvoiceModal, setCurrentPage, addToast } = useUI();
  const { currentUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const canRefresh = currentUser.role === 'Super Admin' || currentUser.role === 'Company Admin';
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'critical') return n.severity === 'critical';
    return true;
  });

  const handleAction = async (n: typeof notifications[0]) => {
    // Navigate first: a failed read-receipt must not block the user from opening the item.
    if (n.type === 'approval_required') setCurrentPage('approvals');
    else if (n.vehicleId) openVehicleDetail(n.vehicleId);
    else if (n.type.includes('invoice') && n.referenceId) openInvoiceModal(n.referenceId);
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

  const handleRefresh = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await refreshExpiryNotifications();
      addToast({ type: 'success', title: 'Alerts refreshed', message: `${created} new alert${created === 1 ? '' : 's'} generated.` });
    } catch (e) {
      addToast({ type: 'error', title: 'Refresh failed', message: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Alerts & Notifications Center
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            System generated alerts for approvals, expiring registrations, insurance and documents, and overdue invoices.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canRefresh && (
            <Button variant="secondary" size="sm" className="rounded-full" onClick={handleRefresh} disabled={busy}>
              Refresh expiry alerts
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={busy || notifications.every(n => n.read)}
            onClick={handleMarkAll}
            leftIcon={<CheckCheck className="w-4 h-4 text-forest-500" />}
          >
            Mark All as Read
          </Button>
        </div>
      </div>

      {/* Segmented Filter Tabs */}
      <div className="inline-flex items-center gap-1.5 p-1 bg-slate-850 border border-slate-700 rounded-full">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
            filter === 'all'
              ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
            filter === 'unread'
              ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Unread ({notifications.filter(n => !n.read).length})
        </button>
        <button
          onClick={() => setFilter('critical')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-all ${
            filter === 'critical'
              ? 'bg-white text-forest-600 shadow-sm border border-slate-700/60'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Critical ({notifications.filter(n => n.severity === 'critical').length})
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="p-8 rounded-[20px] bg-white border border-slate-700 shadow-card text-center">
            <p className="text-sm font-semibold text-slate-200">
              {notifications.length === 0 ? 'No notifications yet' : 'No notifications match this filter'}
            </p>
          </Card>
        )}
        {filtered.map(item => (
          <Card
            key={item.id}
            className={`p-4 sm:p-5 rounded-[20px] transition-all cursor-pointer border ${
              item.read
                ? 'bg-white border-slate-700 opacity-80 hover:opacity-100 shadow-card'
                : 'bg-white border-forest-500/40 shadow-card ring-1 ring-forest-500/20'
            }`}
            onClick={() => handleAction(item)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {item.severity === 'critical' ? (
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                ) : item.severity === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-5 h-5 text-forest-500 shrink-0 mt-0.5" />
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-100">{item.title}</h3>
                    {!item.read && <span className="w-2 h-2 rounded-full bg-forest-500" />}
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{item.message}</p>
                  <p className="text-[10px] text-slate-400 mt-2 font-mono">{formatDateTime(item.date)}</p>
                </div>
              </div>

              <Button variant="secondary" size="xs" className="rounded-full" onClick={e => { e.stopPropagation(); handleAction(item); }}>
                Inspect →
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
