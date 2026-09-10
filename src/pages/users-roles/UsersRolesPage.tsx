import React from 'react';
import { UserCheck, Shield, Check, X, Users, Lock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { UserRole } from '../../types/system';

export const UsersRolesPage: React.FC = () => {
  const { users, currentUser, setCurrentUserId } = useAuth();

  const rolePermissionsMatrix: {
    role: UserRole;
    description: string;
    modules: { name: string; view: boolean; create: boolean; edit: boolean; delete: boolean; approve: boolean }[];
  }[] = [
    {
      role: 'Super Admin',
      description: 'Complete unrestricted administrative control across all fleet, maintenance, finance, accounting, and system configurations.',
      modules: [
        { name: 'Vehicles & Fleet', view: true, create: true, edit: true, delete: true, approve: true },
        { name: 'Maintenance & Work Orders', view: true, create: true, edit: true, delete: true, approve: true },
        { name: 'Invoices & Payments', view: true, create: true, edit: true, delete: true, approve: true },
        { name: 'General Ledger & Accounting', view: true, create: true, edit: true, delete: true, approve: true },
        { name: 'Reports & Audit Logs', view: true, create: true, edit: true, delete: true, approve: true },
      ],
    },
    {
      role: 'Fleet Manager',
      description: 'Manages vehicles, maintenance schedules, tyres, oil changes, documents, accidents, and basic expenditures.',
      modules: [
        { name: 'Vehicles & Fleet', view: true, create: true, edit: true, delete: true, approve: true },
        { name: 'Maintenance & Work Orders', view: true, create: true, edit: true, delete: false, approve: true },
        { name: 'Invoices & Payments', view: true, create: false, edit: false, delete: false, approve: false },
        { name: 'General Ledger & Accounting', view: false, create: false, edit: false, delete: false, approve: false },
        { name: 'Reports & Audit Logs', view: true, create: false, edit: false, delete: false, approve: false },
      ],
    },
    {
      role: 'Maintenance Manager',
      description: 'Workshop job dispatch, preventive maintenance tracking, technician allocation, and work order cost entry.',
      modules: [
        { name: 'Vehicles & Fleet', view: true, create: false, edit: false, delete: false, approve: false },
        { name: 'Maintenance & Work Orders', view: true, create: true, edit: true, delete: false, approve: false },
        { name: 'Invoices & Payments', view: false, create: false, edit: false, delete: false, approve: false },
        { name: 'General Ledger & Accounting', view: false, create: false, edit: false, delete: false, approve: false },
        { name: 'Reports & Audit Logs', view: true, create: false, edit: false, delete: false, approve: false },
      ],
    },
    {
      role: 'Accountant',
      description: 'Purchase and sales invoicing, 3-way reconciliation, payment registrations, double-entry vouchers, and P&L.',
      modules: [
        { name: 'Vehicles & Fleet', view: true, create: false, edit: false, delete: false, approve: false },
        { name: 'Maintenance & Work Orders', view: true, create: false, edit: false, delete: false, approve: false },
        { name: 'Invoices & Payments', view: true, create: true, edit: true, delete: false, approve: false },
        { name: 'General Ledger & Accounting', view: true, create: true, edit: true, delete: false, approve: false },
        { name: 'Reports & Audit Logs', view: true, create: true, edit: false, delete: false, approve: false },
      ],
    },
    {
      role: 'Finance Manager',
      description: 'Financial reporting, authorization of major work orders (>OMR 500), payment approvals, balance sheets, and tax filing.',
      modules: [
        { name: 'Vehicles & Fleet', view: true, create: true, edit: true, delete: false, approve: true },
        { name: 'Maintenance & Work Orders', view: true, create: false, edit: false, delete: false, approve: true },
        { name: 'Invoices & Payments', view: true, create: true, edit: true, delete: false, approve: true },
        { name: 'General Ledger & Accounting', view: true, create: true, edit: true, delete: false, approve: true },
        { name: 'Reports & Audit Logs', view: true, create: true, edit: true, delete: false, approve: true },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2.5">
            <UserCheck className="w-6 h-6 text-indigo-400" />
            <span>Users & Role-Based Access Control (RBAC)</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage corporate user accounts, department assignments, granular module permissions, and active role profiles.
          </p>
        </div>
      </div>

      {/* User Profiles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {users.map(u => {
          const isActive = currentUser.id === u.id;

          return (
            <Card
              key={u.id}
              className={`p-4 transition-all ${isActive ? 'ring-2 ring-indigo-500 border-indigo-500/60 shadow-lg' : 'hover:border-slate-600'}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-slate-800 overflow-hidden shrink-0 border border-slate-700">
                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-100 truncate">{u.name}</h3>
                  <p className="text-xs text-indigo-400 font-semibold">{u.role}</p>
                  <p className="text-[10px] text-slate-400 truncate">{u.department}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">{u.email.split('@')[0]}</span>
                <Button
                  variant={isActive ? 'primary' : 'outline'}
                  size="xs"
                  onClick={() => setCurrentUserId(u.id)}
                >
                  {isActive ? 'Current User' : 'Switch User'}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Granular Permission Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permission & Authorization Matrix</CardTitle>
          <p className="text-xs text-slate-400">Granular view, create, edit, delete, and approval privileges per role</p>
        </CardHeader>
        <div className="overflow-x-auto p-4">
          <div className="space-y-6">
            {rolePermissionsMatrix.map(matrix => (
              <div key={matrix.role} className="border border-slate-800 rounded-xl p-4 bg-slate-950/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-indigo-400" />
                      <span>{matrix.role}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{matrix.description}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <tr>
                        <th className="py-2">Module Area</th>
                        <th className="py-2 text-center">View</th>
                        <th className="py-2 text-center">Create</th>
                        <th className="py-2 text-center">Edit</th>
                        <th className="py-2 text-center">Delete</th>
                        <th className="py-2 text-center">Authorize / Sign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {matrix.modules.map((m, idx) => (
                        <tr key={idx}>
                          <td className="py-2 font-medium text-slate-200">{m.name}</td>
                          <td className="py-2 text-center">{m.view ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}</td>
                          <td className="py-2 text-center">{m.create ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}</td>
                          <td className="py-2 text-center">{m.edit ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}</td>
                          <td className="py-2 text-center">{m.delete ? <Check className="w-4 h-4 text-emerald-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}</td>
                          <td className="py-2 text-center">{m.approve ? <Check className="w-4 h-4 text-indigo-400 mx-auto" /> : <X className="w-4 h-4 text-slate-600 mx-auto" />}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};
