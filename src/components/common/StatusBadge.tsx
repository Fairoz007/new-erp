import React from 'react';
import { Badge, BadgeVariant } from '../ui/Badge';
import { VehicleStatus, TyreStatus } from '../../types/vehicle';
import { WorkOrderStatus } from '../../types/maintenance';
import { InvoicePaymentStatus, InvoiceApprovalStatus, ReconciliationStatus } from '../../types/finance';
import { AccidentStatus } from '../../types/operations';

interface StatusBadgeProps {
  status:
    | VehicleStatus
    | WorkOrderStatus
    | InvoicePaymentStatus
    | InvoiceApprovalStatus
    | ReconciliationStatus
    | AccidentStatus
    | TyreStatus
    | 'Normal'
    | 'Due Soon'
    | 'Overdue'
    | 'Active'
    | 'Inactive'
    | 'Blocked'
    | 'Draft'
    | 'Posted'
    | 'Void'
    | 'Pending'
    | 'Approved'
    | 'Rejected';
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  let variant: BadgeVariant = 'slate';

  switch (status) {
    // Green
    case 'Active':
    case 'Completed':
    case 'Paid':
    case 'Approved':
    case 'Matched':
    case 'Reconciled':
    case 'Good':
    case 'Normal':
    case 'Posted':
      variant = 'emerald';
      break;

    // Amber / Yellow
    case 'Under Maintenance':
    case 'Scheduled':
    case 'In Progress':
    case 'Partially Paid':
    case 'Partially Matched':
    case 'Pending':
    case 'Pending Approval':
    case 'Pending Review':
    case 'Due Soon':
    case 'Fair':
    case 'Insurance Processing':
    case 'Repair Approved':
      variant = 'amber';
      break;

    // Red / Rose
    case 'Accident':
    case 'Overdue':
    case 'Critical':
    case 'Rejected':
    case 'Mismatch':
    case 'Cancelled':
    case 'Blocked':
    case 'Scrapped':
    case 'Void':
      variant = 'rose';
      break;

    // Blue / Cyan
    case 'Requested':
    case 'Under Repair':
    case 'Under Investigation':
    case 'Waiting for Parts':
    case 'Reported':
      variant = 'blue';
      break;

    // Slate / Neutral
    case 'Draft':
    case 'Inactive':
    case 'Reserved':
    case 'Sold':
    case 'Closed':
    case 'Replaced':
    default:
      variant = 'slate';
      break;
  }

  return (
    <Badge variant={variant} size={size} dot>
      {status}
    </Badge>
  );
};
