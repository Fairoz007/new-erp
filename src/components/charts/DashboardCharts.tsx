import React from 'react';
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

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#06b6d4', '#8b5cf6', '#ec4899', '#64748b'];

// Shared light-theme tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-slate-700 p-3 rounded-xl shadow-lg text-sm space-y-1">
        <p className="font-bold text-slate-200">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={`item-${index}`} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}:
            </span>
            <span className="font-semibold text-slate-100">
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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
            </linearGradient>
            <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="month" stroke="#64748B" fontSize={12} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
          <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: '#475569' }} />
          <Area type="monotone" dataKey="Revenue" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
          <Area type="monotone" dataKey="Expenses" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorExp)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// 2. Monthly Maintenance Cost Trend
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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="month" stroke="#64748B" fontSize={12} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
          <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: '#475569' }} />
          <Bar dataKey="Routine" stackId="a" fill="#06b6d4" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Corrective" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Breakdown" stackId="a" fill="#f43f5e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// 3. Expense Distribution Pie Chart
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
    <div className="h-64 w-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
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

// 4. Fleet Age & Status Charts
export const FleetStatusChart: React.FC = () => {
  const { vehicles } = useFleet();

  const counts = vehicles.reduce((acc, v) => {
    acc[v.status] = (acc[v.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const data = Object.entries(counts).map(([name, value]) => ({ name, value }));

  const statusColors: Record<string, string> = {
    Active: '#10b981',
    'Under Maintenance': '#f59e0b',
    Accident: '#f43f5e',
    Inactive: '#64748b',
    Sold: '#8b5cf6',
  };

  return (
    <div className="h-64 w-full flex items-center justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={80}
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

// 5. Depreciation vs Book Value Schedule Chart
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
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="year" stroke="#64748B" fontSize={12} tickLine={false} axisLine={{ stroke: '#E2E8F0' }} />
          <YAxis stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '12px', color: '#475569' }} />
          <Line type="monotone" dataKey="PurchaseCost" stroke="#64748b" strokeWidth={2} strokeDasharray="4 4" name="Initial Cost" dot={false} />
          <Line type="monotone" dataKey="BookValue" stroke="#6366f1" strokeWidth={3} name="Net Book Value" />
          <Line type="monotone" dataKey="Depreciation" stroke="#f43f5e" strokeWidth={2} name="Accumulated Depreciation" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
