import React, { useState } from 'react';
import { Bell, CheckCheck, AlertCircle, AlertTriangle, Info, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useUI, VALID_PAGES, type AppPage } from '../../context/UIContext';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../../utils/date';
import { useNotificationFeed, useNotificationCounts } from '../../services/queries-system';
import type { NotificationItem } from '../../types/system';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tabs } from '../../components/ui/Tabs';

export const NotificationsPage: React.FC = () => {
  // refreshExpiryNotifications: new FleetContext function (wraps services/system.refreshExpiryNotifications, affects ['notifications'])
  const { markNotificationAsRead, markAllNotificationsAsRead, refreshExpiryNotifications } = useFleet();
  const { openVehicleDetail, openInvoiceModal, setCurrentPage, addToast } = useUI();
  const { hasPermission, canAccessPage } = useAuth();
  const [busy, setBusy] = useState(false);
  const canRefresh = hasPermission('edit', 'settings'); // run_expiry_notifications() re-checks
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [shown, setShown] = useState(40);

  // The caller's notifications are paged in the database (v_notification_list); counts come from
  // notification_counts(). Marking read invalidates both (FleetContext invalidates the notification tables).
  const feed = useNotificationFeed(filter, shown);
  const counts = useNotificationCounts();
  const filtered = feed.data?.rows ?? [];
  const filteredTotal = feed.data?.total ?? 0;
  const c = counts.data ?? { total: 0, unread: 0, critical: 0 };

  const handleAction = async (n: NotificationItem) => {
    // Navigate first: a failed read-receipt must not block the user from opening the item.
    if (n.type === 'approval_required') { if (canAccessPage('approvals')) setCurrentPage('approvals'); }
    else if (n.vehicleId && canAccessPage('vehicles')) openVehicleDetail(n.vehicleId);
    else if (n.type.includes('invoice') && n.referenceId) openInvoiceModal(n.referenceId);
    else if (n.link && VALID_PAGES.includes(n.link as AppPage) && canAccessPage(n.link as AppPage)) setCurrentPage(n.link as AppPage);
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
      <PageHeader
        title="Alerts & Notifications Center"
        description="System generated alerts for approvals, expiring registrations, insurance and documents, and overdue invoices."
        actions={
          <>
            {canRefresh && (
              <Button variant="secondary" size="md" onClick={handleRefresh} disabled={busy}>
                Refresh expiry alerts
              </Button>
            )}
            <Button
              variant="outline"
              size="md"
              disabled={busy || c.unread === 0}
              onClick={handleMarkAll}
              leftIcon={<CheckCheck className="w-4 h-4 text-forest-500" />}
            >
              Mark All as Read
            </Button>
          </>
        }
      />

      {/* Segmented Filter Tabs */}
      <Tabs
        variant="segmented"
        className="w-fit"
        ariaLabel="Notification filter"
        activeTab={filter}
        onChange={id => setFilter(id as typeof filter)}
        tabs={[
          { id: 'all', label: 'All', count: c.total },
          { id: 'unread', label: 'Unread', count: c.unread },
          { id: 'critical', label: 'Critical', count: c.critical },
        ]}
      />

      {/* Notifications List */}
      <div className="space-y-3">
        {(feed.error || (feed.loading && !feed.data)) && (
          <Card className="p-8 rounded-[20px] bg-white border border-slate-700 shadow-card text-center">
            {feed.error ? (
              <p className="text-sm text-rose-600">
                Could not load notifications: {feed.error.message}{' '}
                <button className="underline font-bold cursor-pointer" onClick={() => void feed.refetch()}>Retry</button>
              </p>
            ) : <p className="text-sm text-slate-400">Loading…</p>}
          </Card>
        )}
        {feed.data && !feed.error && filtered.length === 0 && (
          <Card className="p-8 rounded-[20px] bg-white border border-slate-700 shadow-card text-center">
            <p className="text-sm font-semibold text-slate-200">
              {c.total === 0 ? 'No notifications yet' : 'No notifications match this filter'}
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
                    {!item.read && <span className="w-2 h-2 rounded-full bg-forest-500" role="img" aria-label="Unread" />}
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
        {filteredTotal > filtered.length && (
          <div className="text-center">
            <Button variant="outline" size="sm" disabled={feed.fetching} onClick={() => setShown(n => n + 40)}>
              {feed.fetching ? 'Loading…' : `Show more (${filteredTotal - filtered.length} remaining)`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
