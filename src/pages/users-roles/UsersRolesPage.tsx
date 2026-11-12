// Users & Roles: invitations, per-office access and the data-driven role matrix.
// Same components as Setup Wizard steps 4 and 5; the database (RLS, guard triggers, RPCs) enforces every rule.
import React, { useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Tabs } from '../../components/ui/Tabs';
import { useAuth } from '../../context/AuthContext';
import { UsersStep } from '../setup/steps/UsersStep';
import { RolesEditor } from '../setup/RolesEditor';

export const UsersRolesPage: React.FC = () => {
  const { hasPermission, users, roles } = useAuth();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const canEdit = hasPermission('edit', 'users-roles');

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 tracking-tight">Users & Roles</h1>
          <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
            Invite people, choose their offices and the role they hold in each, and define what every role may do.
          </p>
        </div>
        {!canEdit && <Badge variant="slate">Read-only</Badge>}
      </div>
      <Tabs variant="pills" activeTab={tab} onChange={id => setTab(id as 'users' | 'roles')}
        tabs={[{ id: 'users', label: 'Users', count: users.length }, { id: 'roles', label: 'Roles & permissions', count: roles.length }]} />
      {tab === 'users' ? <UsersStep /> : <RolesEditor />}
    </div>
  );
};
