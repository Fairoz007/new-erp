import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { useFleet } from '../../context/FleetContext';
import { formatCurrency } from '../../utils/financial';

const CHART_COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#F43F5E', '#06B6D4', '#8B5CF6', '#EC4899', '#64748B'];

// Shared clean reference tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-700 p-2.5 rounded-xl shadow-elevated text-xs space-y-1 z-50">
        <p className="font-semibold text-slate-100">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-semibold text-slate-100 tabular-nums">
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
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E7EA" vertical={false} />
          <XAxis dataKey="month" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7E7EA' }} />
          <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#6B6B72' }} />
          <Area type="monotone" dataKey="Revenue" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
          <Area type="monotone" dataKey="Expenses" stroke="#4F46E5" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// 2. Monthly Maintenance Cost Trend with rounded reference bars
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
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E7EA" vertical={false} />
          <XAxis dataKey="month" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7E7EA' }} />
          <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#6B6B72' }} />
          <Bar dataKey="Routine" stackId="a" fill="#06B6D4" radius={[0, 0, 0, 0]} barSize={22} />
          <Bar dataKey="Corrective" stackId="a" fill="#F59E0B" radius={[0, 0, 0, 0]} barSize={22} />
          <Bar dataKey="Breakdown" stackId="a" fill="#F43F5E" radius={[4, 4, 0, 0]} barSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// 3. Reference-Style Fleet Operating Costs Monthly Bar Chart
export const FleetMonthlyOperatingCostsChart: React.FC = () => {
  const [activeIndex, setActiveIndex] = useState<number>(7); // default Aug is active

  const data = [
    { month: 'Jan', cost: 6800 },
    { month: 'Feb', cost: 8900 },
    { month: 'Mar', cost: 7400 },
    { month: 'Apr', cost: 9500 },
    { month: 'May', cost: 11200 },
    { month: 'Jun', cost: 10400 },
    { month: 'Jul', cost: 12800 },
    { month: 'Aug', cost: 14600 },
  ];

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          onMouseMove={(state: any) => {
            if (state && state.activeTooltipIndex !== undefined) {
              setActiveIndex(state.activeTooltipIndex);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E7EA" vertical={false} />
          <XAxis dataKey="month" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7E7EA' }} />
          <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="cost" name="Operating Cost" radius={[6, 6, 0, 0]} barSize={24}>
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={index === activeIndex ? '#4F46E5' : '#DDD6FE'}
                className="transition-colors duration-200 cursor-pointer"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// 4. Expense Distribution Pie Chart
export const ExpenseCategoryPieChart: React.FC = () => {
  const data = [
    { name: 'Fuel', value: 24300 },
    { name: 'Maintenance', value: 12480 },
    { name: 'Insurance', value: 5400 },
    { name: 'Tyres', value: 4820 },
    { name: 'Oil Changes', value: 2150 },
    { name: 'Registration', value: 1650 },
    { name: 'Accidents', value: 750 },
    { name: 'Tolls & Other', value: 890 },
  ];

  return (
    <div className="h-60 w-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="#ffffff" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// 5. Fleet Age & Status Charts
export const FleetStatusChart: React.FC = () => {
  const { vehicles } = useFleet();

  const counts = vehicles.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));

  const statusColors: Record<string, string> = {
    Active: '#10B981',
    'Under Maintenance': '#F59E0B',
    Accident: '#F43F5E',
    Inactive: '#64748B',
    Sold: '#8B5CF6',
  };

  return (
    <div className="h-60 w-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={52}
            outerRadius={78}
            paddingAngle={4}
            dataKey="value"
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={statusColors[entry.name] || CHART_COLORS[index]} stroke="#ffffff" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// 6. Depreciation vs Book Value Schedule Chart
export const AssetDepreciationChart: React.FC = () => {
  const data = [
    { year: '2022', PurchaseCost: 148300, BookValue: 148300, Depreciation: 0 },
    { year: '2023', PurchaseCost: 148300, BookValue: 123700, Depreciation: 24600 },
    { year: '2024', PurchaseCost: 148300, BookValue: 99100, Depreciation: 49200 },
    { year: '2025', PurchaseCost: 148300, BookValue: 74500, Depreciation: 73800 },
    { year: '2026 (Now)', PurchaseCost: 148300, BookValue: 49900, Depreciation: 98400 },
    { year: '2027 (Est)', PurchaseCost: 148300, BookValue: 25300, Depreciation: 123000 },
  ];

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E7E7EA" vertical={false} />
          <XAxis dataKey="year" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={{ stroke: '#E7E7EA' }} />
          <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} tickFormatter={val => `${val / 1000}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px', color: '#6B6B72' }} />
          <Line type="monotone" dataKey="PurchaseCost" stroke="#8E8E93" strokeWidth={1.5} strokeDasharray="4 4" name="Initial Cost" dot={false} />
          <Line type="monotone" dataKey="BookValue" stroke="#4F46E5" strokeWidth={2.5} name="Net Book Value" />
          <Line type="monotone" dataKey="Depreciation" stroke="#F43F5E" strokeWidth={2} name="Accumulated Depreciation" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
