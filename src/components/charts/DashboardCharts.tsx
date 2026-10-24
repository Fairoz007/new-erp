import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatCurrency } from '../../utils/financial';

const CHART_COLORS = ['#086343', '#4CAE88', '#D9A441', '#D94B4B', '#2563EB', '#8ACDB0', '#06452F', '#7B8581'];

// Shared clean reference tooltip
export const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-700 p-3 rounded-2xl shadow-elevated text-xs space-y-1.5 z-50">
        <p className="font-bold text-slate-100">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400 font-medium">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-bold text-slate-100 tabular-nums">
              {typeof entry.value === 'number' && entry.value > 10 ? formatCurrency(entry.value) : entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// 1. Revenue vs Expense Chart
export const RevenueVsExpenseChart: React.FC = () => {
  const data = [
    { month: 'Jan', Revenue: 18500, Expenses: 11200, Profit: 7300 },
    { month: 'Feb', Revenue: 21000, Expenses: 13400, Profit: 7600 },
    { month: 'Mar', Revenue: 19800, Expenses: 12100, Profit: 7700 },
    { month: 'Apr', Revenue: 24500, Expenses: 15600, Profit: 8900 },
    { month: 'May', Revenue: 26000, Expenses: 14800, Profit: 11200 },
    { month: 'Jun', Revenue: 28200, Expenses: 16900, Profit: 11300 },
    { month: 'Jul', Revenue: 25400, Expenses: 15300, Profit: 10100 },
    { month: 'Aug', Revenue: 29800, Expenses: 17200, Profit: 12600 },
  ];

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#086343" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#086343" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7B8581" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#7B8581" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE8" vertical={false} />
          <XAxis dataKey="month" stroke="#7B8581" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7EBE8' }} />
          <YAxis stroke="#7B8581" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#7B8581' }} />
          <Area type="monotone" dataKey="Revenue" stroke="#086343" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" />
          <Area type="monotone" dataKey="Expenses" stroke="#7B8581" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// 2. Reference-Style Capsule/Pill Bar Chart (Exact replica of "Project Analytics" in Reference Image)
export const ReferencePillBarChart: React.FC = () => {
  const days = [
    { day: 'S', value: 45, status: 'striped', cost: '420 OMR' },
    { day: 'M', value: 75, status: 'medium', cost: '780 OMR' },
    { day: 'T', value: 65, status: 'light', cost: '620 OMR', badge: '74%' },
    { day: 'W', value: 92, status: 'dark', cost: '920 OMR' },
    { day: 'T', value: 48, status: 'striped', cost: '460 OMR' },
    { day: 'F', value: 38, status: 'striped', cost: '380 OMR' },
    { day: 'S', value: 50, status: 'striped', cost: '510 OMR' },
  ];

  return (
    <div className="w-full flex flex-col justify-between h-[230px] pt-4">
      {/* SVG Definitions for Stripes Pattern */}
      <svg className="w-0 h-0 absolute">
        <defs>
          <pattern id="diagonalHatch" patternUnits="userSpaceOnUse" width="6" height="6">
            <path d="M-1,1 l2,-2 M0,6 l6,-6 M5,7 l2,-2" stroke="#CBD5E1" strokeWidth="1.5" />
          </pattern>
        </defs>
      </svg>

      <div className="flex items-end justify-between gap-2.5 h-[170px] px-2 sm:px-4">
        {days.map((item, index) => {
          const heightPercent = item.value;
          const isDark = item.status === 'dark';
          const isLight = item.status === 'light';
          const isMedium = item.status === 'medium';
          const isStriped = item.status === 'striped';

          return (
            <div key={index} className="flex-1 flex flex-col items-center justify-end h-full group relative">
              {/* Badge if present (like the 74% badge in screenshot) */}
              {item.badge && (
                <div className="absolute -top-7 z-10 bg-white border border-slate-700 shadow-sm text-[10px] font-bold text-slate-100 px-1.5 py-0.5 rounded-md">
                  {item.badge}
                </div>
              )}

              {/* Tooltip on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-100 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md shadow-md pointer-events-none whitespace-nowrap z-20">
                {item.cost}
              </div>

              {/* Capsule Pill Bar */}
              <div
                style={{ height: `${heightPercent}%` }}
                className={`w-full max-w-[34px] rounded-full transition-all duration-300 transform group-hover:scale-y-105 ${
                  isDark
                    ? 'bg-[#086343] shadow-sm'
                    : isMedium
                    ? 'bg-[#06452F]'
                    : isLight
                    ? 'bg-[#4CAE88]'
                    : 'border-2 border-slate-700'
                }`}
              >
                {isStriped && (
                  <svg className="w-full h-full rounded-full">
                    <rect width="100%" height="100%" fill="url(#diagonalHatch)" rx="17" />
                  </svg>
                )}
              </div>

              {/* Day Label */}
              <span className="mt-3 text-xs font-semibold text-slate-400 group-hover:text-slate-100 transition-colors">
                {item.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// 3. Maintenance Cost Trend
export const MaintenanceTrendChart: React.FC = () => {
  const data = [
    { month: 'Jan', Routine: 420, Corrective: 310, Breakdown: 150 },
    { month: 'Feb', Routine: 550, Corrective: 200, Breakdown: 0 },
    { month: 'Mar', Routine: 380, Corrective: 680, Breakdown: 250 },
    { month: 'Apr', Routine: 620, Corrective: 410, Breakdown: 0 },
    { month: 'May', Routine: 490, Corrective: 520, Breakdown: 180 },
    { month: 'Jun', Routine: 710, Corrective: 340, Breakdown: 0 },
    { month: 'Jul', Routine: 580, Corrective: 490, Breakdown: 120 },
    { month: 'Aug', Routine: 640, Corrective: 780, Breakdown: 350 },
  ];

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE8" vertical={false} />
          <XAxis dataKey="month" stroke="#7B8581" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7EBE8' }} />
          <YAxis stroke="#7B8581" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#7B8581' }} />
          <Bar dataKey="Routine" stackId="a" fill="#086343" radius={[0, 0, 0, 0]} barSize={20} />
          <Bar dataKey="Corrective" stackId="a" fill="#D9A441" radius={[0, 0, 0, 0]} barSize={20} />
          <Bar dataKey="Breakdown" stackId="a" fill="#D94B4B" radius={[6, 6, 0, 0]} barSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// 4. Asset Depreciation Chart
export const AssetDepreciationChart: React.FC = () => {
  const data = [
    { year: '2021', Cost: 180000, BookValue: 180000 },
    { year: '2022', Cost: 180000, BookValue: 144000 },
    { year: '2023', Cost: 240000, BookValue: 172000 },
    { year: '2024', Cost: 240000, BookValue: 148000 },
    { year: '2025', Cost: 310000, BookValue: 210000 },
    { year: '2026', Cost: 310000, BookValue: 185000 },
  ];

  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7B8581" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#7B8581" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#086343" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#086343" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7EBE8" vertical={false} />
          <XAxis dataKey="year" stroke="#7B8581" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7EBE8' }} />
          <YAxis stroke="#7B8581" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#7B8581' }} />
          <Area type="monotone" dataKey="Cost" name="Historical Cost" stroke="#7B8581" strokeWidth={2} fillOpacity={1} fill="url(#colorCost)" />
          <Area type="monotone" dataKey="BookValue" name="Net Book Value" stroke="#086343" strokeWidth={2.5} fillOpacity={1} fill="url(#colorValue)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
