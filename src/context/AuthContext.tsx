import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, UserRole, Permission } from '../types/system';
import { INITIAL_USERS } from '../data/initialSeedData';

interface AuthContextType {
  currentUser: User;
  users: User[];
  setCurrentUserId: (id: string) => void;
  hasPermission: (permission: Permission, moduleName?: string) => boolean;
  canApprove: (module: 'maintenance' | 'invoice' | 'expense', amount: number) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [users] = useState<User[]>(INITIAL_USERS);
  const [currentUserId, setCurrentUserId] = useState<string>('usr-1'); // Default to Ahmed Al-Harthy (Super Admin)

  const currentUser = users.find(u => u.id === currentUserId) || users[0];

  const hasPermission = (permission: Permission, moduleName?: string): boolean => {
    const role = currentUser.role;

    if (role === 'Super Admin') return true;
    if (role === 'Viewer') return permission === 'view' || permission === 'export' || permission === 'print';

    switch (role) {
      case 'Company Admin':
        return true;
      case 'Fleet Manager':
        if (['finance', 'accounting', 'balance-sheet'].includes(moduleName || '')) {
          return permission === 'view';
        }
        return true;
      case 'Maintenance Manager':
        if (['maintenance', 'oil', 'tyres', 'work-orders'].includes(moduleName || '')) {
          return true;
        }
        return permission === 'view';
      case 'Accountant':
        if (['invoices', 'payments', 'reconciliation', 'accounting', 'pnl', 'balance-sheet'].includes(moduleName || '')) {
          return true;
        }
        return permission === 'view';
      case 'Finance Manager':
        return true;
      case 'Procurement':
        if (['suppliers', 'invoices', 'reconciliation'].includes(moduleName || '')) {
          return true;
        }
        return permission === 'view';
      case 'Management':
        return permission === 'view' || permission === 'export' || permission === 'print';
      default:
        return permission === 'view';
    }
  };

  const canApprove = (module: 'maintenance' | 'invoice' | 'expense', amount: number): boolean => {
    const role = currentUser.role;
    if (role === 'Super Admin') return true;
    if (role === 'Finance Manager') return true;
    if (role === 'Fleet Manager' && module === 'maintenance' && amount <= 500) return true;
    if (role === 'Accountant' && module === 'invoice' && amount <= 500) return true;
    return false;
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        setCurrentUserId,
        hasPermission,
        canApprove,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
