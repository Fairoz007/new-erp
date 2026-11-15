import React, { ReactNode } from 'react';
import { Drawer } from './Drawer';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg' | 'xl' | '2xl';
  /** Ask before discarding typed input (Escape, backdrop, close button). Default true. */
  guardUnsaved?: boolean;
}

/**
 * Edit panel that slides in from the right on desktop and fills the screen on a phone.
 * Same dialog behaviour as every modal (focus trap, Escape, unsaved-changes question): see useDialog.
 */
export const SidePanel: React.FC<SidePanelProps> = ({ width = 'xl', guardUnsaved = true, ...props }) => (
  <Drawer {...props} width={width} guardUnsaved={guardUnsaved} />
);
