import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/Card';
import { formatCurrency } from '../../utils/financial';
import { AlertCircle, ArrowRight, Pause, Play, Square } from 'lucide-react';

interface FleetAvailabilityProps {
  totalVehicles: number;
  activeVehicles: number;
  workshopVehicles: number;
  accidentVehicles: number;
  inactiveVehicles: number;
}

// 1. Semi-Circular Arc Gauge (Exact Reference Match for "Project Progress")
export const FleetAvailabilityGaugeCard: React.FC<FleetAvailabilityProps> = ({
  totalVehicles,
  activeVehicles,
  workshopVehicles,
  accidentVehicles,
  inactiveVehicles,
}) => {
  const percentage = totalVehicles > 0 ? Math.round((activeVehicles / totalVehicles) * 100) : 0;
  const workshopPct = totalVehicles > 0 ? Math.round((workshopVehicles / totalVehicles) * 100) : 0;

  // Arc math for 180 deg semi-circle
  const radius = 64;
  const strokeWidth = 14;
  const circumference = Math.PI * radius; // Half-circle perimeter
  const activeOffset = circumference - (percentage / 100) * circumference;

  return (
    <Card className="bg-white border-slate-700">
      <CardHeader className="py-4 px-5">
        <CardTitle className="text-sm font-bold text-slate-100">Fleet Availability</CardTitle>
      </CardHeader>
      <CardContent className="p-5 flex flex-col items-center">
        {/* Semi-circular Arc SVG */}
        <div className="relative w-52 h-28 flex items-end justify-center overflow-hidden">
          <svg className="w-52 h-52 transform -rotate-180 absolute top-0" viewBox="0 0 160 160">
            <defs>
              <pattern id="arcHatch" patternUnits="userSpaceOnUse" width="4" height="4">
                <path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#CBD5E1" strokeWidth="1" />
              </pattern>
            </defs>

            {/* Background Track with diagonal stripes */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="url(#arcHatch)"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset="0"
            />

            {/* In-workshop segment (Sage green) */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="#4CAE88"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference - ((percentage + workshopPct) / 100) * circumference}
              className="transition-all duration-700 ease-out"
            />

            {/* Active Fleet Progress (Dark forest green) */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              stroke="#086343"
              strokeWidth={strokeWidth}
              fill="transparent"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={activeOffset}
              className="transition-all duration-700 ease-out"
            />
          </svg>

          {/* Centered Big Label */}
          <div className="relative z-10 flex flex-col items-center pb-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-slate-100 tabular-nums leading-none">
              {percentage}%
            </span>
            <span className="text-[11px] font-semibold text-slate-400 mt-1">
              Active In Service
            </span>
          </div>
        </div>

        {/* Legend beneath the semi-circle */}
        <div className="mt-5 flex items-center justify-center gap-4 text-xs font-semibold">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#086343] shrink-0" />
            <span className="text-slate-100">Active ({activeVehicles})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4CAE88] shrink-0" />
            <span className="text-slate-400">Workshop ({workshopVehicles})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 border border-slate-400 shrink-0" />
            <span className="text-slate-400">Offline ({accidentVehicles + inactiveVehicles})</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// 2. Operational Shift Tracker (Exact Reference Match for "Time Tracker")
export const OperationalShiftTrackerCard: React.FC = () => {
  const [seconds, setSeconds] = useState(5048); // default ~01:24:08 like in screenshot
  const [isRunning, setIsRunning] = useState(true);

  useEffect(() => {
    let interval: any = null;
    if (isRunning) {
      interval = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (totalSecs: number) => {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="rounded-[20px] bg-gradient-to-br from-[#06452F] via-[#086343] to-[#021a12] p-5 text-white shadow-card relative overflow-hidden">
      {/* Background wave graphics */}
      <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" viewBox="0 0 300 150" preserveAspectRatio="none">
        <path d="M0,60 C80,120 150,0 230,80 C270,120 300,50 300,90 L300,150 L0,150 Z" fill="#4CAE88" />
        <path d="M0,90 C60,40 120,110 200,60 C260,20 280,110 300,70 L300,150 L0,150 Z" fill="#FFFFFF" />
      </svg>

      <div className="relative z-10 flex flex-col justify-between h-full space-y-4">
        <div>
          <span className="text-xs font-semibold text-white/80">Shift & Odometer Tracker</span>
          <p className="text-[11px] text-white/60">Live Driver Dispatch Shift</p>
        </div>

        <div className="text-center py-1">
          <span className="text-4xl font-extrabold text-white tracking-wider font-mono">
            {formatTime(seconds)}
          </span>
        </div>

        {/* Circular Action Control Buttons */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setIsRunning(r => !r)}
            className="w-10 h-10 rounded-full bg-white text-[#086343] flex items-center justify-center hover:bg-slate-100 transition-transform active:scale-95 shadow-md cursor-pointer"
            title={isRunning ? 'Pause Shift' : 'Resume Shift'}
          >
            {isRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => {
              setIsRunning(false);
              setSeconds(0);
            }}
            className="w-10 h-10 rounded-full bg-[#D94B4B] text-white flex items-center justify-center hover:bg-rose-700 transition-transform active:scale-95 shadow-md cursor-pointer"
            title="Reset Shift Timer"
          >
            <Square className="w-4 h-4 fill-current" />
          </button>
        </div>
      </div>
    </div>
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
    { label: 'Maintenance', value: maintenanceCost, color: '#086343' },
    { label: 'Oil Service', value: oilCost, color: '#D9A441' },
    { label: 'Tyres', value: tyreCost, color: '#4CAE88' },
    { label: 'Accidents', value: accidentCost, color: '#D94B4B' },
    { label: 'Insurance & Other', value: otherCost || insuranceCost, color: '#7B8581' },
  ];

  return (
    <Card className="bg-white border-slate-700">
      <CardHeader className="py-4 px-5">
        <CardTitle className="text-sm font-bold text-slate-100">Operating Cost Allocation</CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {/* Horizontal Segmented Distribution Bar */}
        <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-800">
          {segments.map((s, idx) => {
            const pct = total > 0 && s.value > 0 ? Math.max(3, Math.round((s.value / total) * 100)) : 0;
            if (pct === 0) return null;
            return (
              <div
                key={idx}
                style={{ width: `${pct}%`, backgroundColor: s.color }}
                title={`${s.label}: ${pct}%`}
                className="h-full transition-all duration-500 hover:opacity-85"
              />
            );
          })}
        </div>

        {/* Cost Rows */}
        <div className="space-y-2 pt-1 text-xs">
          {segments.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-700/60 last:border-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-slate-400 font-semibold">{s.label}</span>
              </div>
              <span className="text-slate-100 font-bold tabular-nums">
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
        className="py-4 px-5"
        action={
          onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs font-bold text-[#086343] hover:underline cursor-pointer"
            >
              View All ({items.length})
            </button>
          )
        }
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-[#D9A441] shrink-0" />
          <CardTitle className="text-sm font-bold text-slate-100">Attention Required</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No high priority alerts.</p>
        ) : (
          <div className="space-y-2.5">
            {items.slice(0, 4).map(item => (
              <div
                key={item.id}
                onClick={item.onClickAction}
                className="p-3 rounded-xl border border-slate-700 hover:border-forest-500/40 hover:bg-slate-850/60 transition-all cursor-pointer group flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-100 truncate group-hover:text-[#086343] transition-colors">
                      {item.name}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-850 border border-slate-700 text-slate-400 shrink-0">
                      {item.plate}
                    </span>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                      item.severity === 'critical'
                        ? 'bg-[#FFE4E6] text-[#9F1239]'
                        : 'bg-[#FEF3C7] text-[#92400E]'
                    }`}
                  >
                    {item.severity === 'critical' ? 'Critical' : 'Due Soon'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 line-clamp-1 leading-snug">
                  {item.reason}
                </p>

                <div className="flex items-center justify-between pt-1 border-t border-slate-700/60 text-[11px]">
                  <span className="text-[#086343] font-bold flex items-center gap-1 group-hover:underline">
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
