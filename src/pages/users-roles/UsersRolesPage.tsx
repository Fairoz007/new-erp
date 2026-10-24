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
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">
            Users & Role-Based Access Control (RBAC)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
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
              className={`p-5 rounded-[20px] bg-white border transition-all ${
                isActive
                  ? 'ring-2 ring-forest-500 border-forest-500 shadow-card'
                  : 'border-slate-700 hover:border-slate-600 shadow-card'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-850 overflow-hidden shrink-0 border border-slate-700">
                  <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm text-slate-100 truncate">{u.name}</h3>
                  <p className="text-xs text-forest-600 font-semibold">{u.role}</p>
                  <p className="text-[10px] text-slate-400 truncate">{u.department}</p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-mono">{u.email.split('@')[0]}</span>
                <Button
                  variant={isActive ? 'primary' : 'outline'}
                  size="xs"
                  className="rounded-full"
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
      <Card className="rounded-[20px] bg-white border border-slate-700 shadow-card">
        <CardHeader>
          <CardTitle>Role Permission & Authorization Matrix</CardTitle>
          <p className="text-xs text-slate-400">Granular view, create, edit, delete, and approval privileges per role</p>
        </CardHeader>
        <div className="overflow-x-auto p-4 sm:p-5">
          <div className="space-y-6">
            {rolePermissionsMatrix.map(matrix => (
              <div key={matrix.role} className="border border-slate-700 rounded-[16px] p-4 bg-slate-850/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-forest-500" />
                      <span>{matrix.role}</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">{matrix.description}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-700">
                      <tr>
                        <th className="py-2.5">Module Area</th>
                        <th className="py-2.5 text-center">View</th>
                        <th className="py-2.5 text-center">Create</th>
                        <th className="py-2.5 text-center">Edit</th>
                        <th className="py-2.5 text-center">Delete</th>
                        <th className="py-2.5 text-center">Authorize / Sign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      {matrix.modules.map((m, idx) => (
                        <tr key={idx}>
                          <td className="py-2.5 font-medium text-slate-200">{m.name}</td>
                          <td className="py-2.5 text-center">{m.view ? <Check className="w-4 h-4 text-forest-600 mx-auto" /> : <X className="w-4 h-4 text-slate-400 mx-auto" />}</td>
                          <td className="py-2.5 text-center">{m.create ? <Check className="w-4 h-4 text-forest-600 mx-auto" /> : <X className="w-4 h-4 text-slate-400 mx-auto" />}</td>
                          <td className="py-2.5 text-center">{m.edit ? <Check className="w-4 h-4 text-forest-600 mx-auto" /> : <X className="w-4 h-4 text-slate-400 mx-auto" />}</td>
                          <td className="py-2.5 text-center">{m.delete ? <Check className="w-4 h-4 text-forest-600 mx-auto" /> : <X className="w-4 h-4 text-slate-400 mx-auto" />}</td>
                          <td className="py-2.5 text-center">{m.approve ? <Check className="w-4 h-4 text-forest-600 mx-auto" /> : <X className="w-4 h-4 text-slate-400 mx-auto" />}</td>
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
