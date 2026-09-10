import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCurrency } from '../../utils/financial';
import { Clock, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';

interface FleetAvailabilityProps {
  totalVehicles: number;
  activeVehicles: number;
  workshopVehicles: number;
  accidentVehicles: number;
  inactiveVehicles: number;
}

export const FleetAvailabilityCard: React.FC<FleetAvailabilityProps> = ({
  totalVehicles,
  activeVehicles,
  workshopVehicles,
  accidentVehicles,
  inactiveVehicles,
}) => {
  const percentage = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Card className="bg-white border-slate-700">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold text-slate-100">Fleet Availability</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-center justify-center py-2">
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Background Track */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-slate-800"
                strokeWidth="8"
                stroke="currentColor"
                fill="transparent"
              />
              {/* Active Progress */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                className="text-indigo-600 transition-all duration-700 ease-out"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-2xl font-bold text-slate-100 tabular-nums leading-none">{percentage}%</span>
              <span className="text-[11px] font-medium text-slate-400 mt-1">Available</span>
            </div>
          </div>
        </div>

        {/* Breakdown List */}
        <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-3 gap-2 text-center">
          <div className="p-1.5 rounded-lg bg-slate-850">
            <div className="flex items-center justify-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] text-slate-400">Active</span>
            </div>
            <p className="text-sm font-bold text-slate-100 mt-0.5 tabular-nums">{activeVehicles}</p>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-850">
            <div className="flex items-center justify-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-[11px] text-slate-400">Workshop</span>
            </div>
            <p className="text-sm font-bold text-slate-100 mt-0.5 tabular-nums">{workshopVehicles}</p>
          </div>
          <div className="p-1.5 rounded-lg bg-slate-850">
            <div className="flex items-center justify-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
              <span className="text-[11px] text-slate-400">Accident</span>
            </div>
            <p className="text-sm font-bold text-slate-100 mt-0.5 tabular-nums">{accidentVehicles}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

interface CostBreakdownProps {
  maintenanceCost: number;
  oilCost: number;
  tyreCost: number;
  accidentCost: number;
  insuranceCost: number;
  totalOperatingCost: number;
  currency: string;
}

export const OperatingCostBreakdownCard: React.FC<CostBreakdownProps> = ({
  maintenanceCost,
  oilCost,
  tyreCost,
  accidentCost,
  insuranceCost,
  totalOperatingCost,
  currency,
}) => {
  const otherCost = Math.max(
    0,
    totalOperatingCost - (maintenanceCost + oilCost + tyreCost + accidentCost)
  );

  const total = maintenanceCost + oilCost + tyreCost + accidentCost + otherCost || 1;

  const segments = [
    { label: 'Maintenance', value: maintenanceCost, color: '#4F46E5', bgClass: 'bg-indigo-600' },
    { label: 'Oil Service', value: oilCost, color: '#F59E0B', bgClass: 'bg-amber-500' },
    { label: 'Tyres', value: tyreCost, color: '#06B6D4', bgClass: 'bg-cyan-500' },
    { label: 'Accidents', value: accidentCost, color: '#F43F5E', bgClass: 'bg-rose-500' },
    { label: 'Insurance & Other', value: otherCost || insuranceCost, color: '#64748B', bgClass: 'bg-slate-400' },
  ];

  return (
    <Card className="bg-white border-slate-700">
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm font-semibold text-slate-100">Operating Cost Allocation</CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {/* Horizontal Segmented Distribution Bar */}
        <div className="w-full h-2.5 rounded-full overflow-hidden flex bg-slate-800">
          {segments.map((s, idx) => {
            const pct = Math.max(3, Math.round((s.value / total) * 100));
            return (
              <div
                key={idx}
                style={{ width: `${pct}%`, backgroundColor: s.color }}
                title={`${s.label}: ${pct}%`}
                className="h-full transition-all duration-500 hover:opacity-80"
              />
            );
          })}
        </div>

        {/* Cost Rows */}
        <div className="space-y-1.5 pt-1 text-xs">
          {segments.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-750 last:border-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-slate-300 font-medium">{s.label}</span>
              </div>
              <span className="text-slate-100 font-semibold tabular-nums">
                {formatCurrency(s.value, currency)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export interface AttentionItem {
  id: string;
  vehicleId: string;
  plate: string;
  name: string;
  reason: string;
  type: string;
  severity: 'critical' | 'warning';
  actionText: string;
  onClickAction: () => void;
}

interface AttentionRequiredProps {
  items: AttentionItem[];
  onViewAll?: () => void;
}

export const AttentionRequiredCard: React.FC<AttentionRequiredProps> = ({ items, onViewAll }) => {
  return (
    <Card className="bg-white border-slate-700">
      <CardHeader
        className="py-3 px-4"
        action={
          onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer"
            >
              View All ({items.length})
            </button>
          )
        }
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <CardTitle className="text-sm font-semibold text-slate-100">Attention Required</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 py-3 text-center">No high priority alerts.</p>
        ) : (
          <div className="space-y-2">
            {items.slice(0, 5).map(item => (
              <div
                key={item.id}
                onClick={item.onClickAction}
                className="p-2.5 rounded-lg border border-slate-700 hover:border-indigo-300 hover:bg-slate-850/60 transition-all cursor-pointer group flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-bold text-slate-100 truncate group-hover:text-indigo-600 transition-colors">
                      {item.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-850 border border-slate-700 text-slate-400 shrink-0">
                      {item.plate}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 ${
                      item.severity === 'critical'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {item.severity === 'critical' ? 'Critical' : 'Due Soon'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug">
                  {item.reason}
                </p>

                <div className="flex items-center justify-between pt-1 border-t border-slate-700/60 text-[11px]">
                  <span className="text-indigo-600 font-medium flex items-center gap-1 group-hover:underline">
                    {item.actionText}
                    <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
