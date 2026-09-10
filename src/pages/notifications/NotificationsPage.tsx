import React, { useState } from 'react';
import { Bell, CheckCheck, AlertCircle, AlertTriangle, Info, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useFleet } from '../../context/FleetContext';
import { useUI } from '../../context/UIContext';
import { formatDateTime } from '../../utils/date';

export const NotificationsPage: React.FC = () => {
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useFleet();
  const { openVehicleDetail, openInvoiceModal, setCurrentPage } = useUI();
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read;
    if (filter === 'critical') return n.severity === 'critical';
    return true;
  });

  const handleAction = (n: typeof notifications[0]) => {
    markNotificationAsRead(n.id);
    if (n.vehicleId) openVehicleDetail(n.vehicleId);
    else if (n.type.includes('invoice') && n.referenceId) openInvoiceModal(n.referenceId);
    else if (n.type === 'approval_required') setCurrentPage('approvals');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-rose-400" />
            <span>Alerts & Notifications Center</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            System generated alerts for oil service limits, expiring registrations, insurance renewals, and payment milestones.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={markAllNotificationsAsRead} leftIcon={<CheckCheck className="w-4 h-4" />}>
            Mark All as Read
          </Button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 p-1 bg-slate-900 border border-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${filter === 'unread' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Unread ({notifications.filter(n => !n.read).length})
        </button>
        <button
          onClick={() => setFilter('critical')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${filter === 'critical' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Critical ({notifications.filter(n => n.severity === 'critical').length})
        </button>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filtered.map(item => (
          <Card
            key={item.id}
            className={`p-4 sm:p-5 transition-all cursor-pointer ${
              item.read ? 'opacity-80 hover:opacity-100' : 'border-indigo-500/50 bg-slate-900/90 shadow-md'
            }`}
            onClick={() => handleAction(item)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {item.severity === 'critical' ? (
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                ) : item.severity === 'warning' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                )}

                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-100">{item.title}</h3>
                    {!item.read && <span className="w-2 h-2 rounded-full bg-indigo-500" />}
                  </div>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">{item.message}</p>
                  <p className="text-[10px] text-slate-500 mt-2 font-mono">{formatDateTime(item.date)}</p>
                </div>
              </div>

              <Button variant="secondary" size="xs" onClick={() => handleAction(item)}>
                Inspect →
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
