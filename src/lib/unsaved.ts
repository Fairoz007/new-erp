// Unsaved-changes guard. Forms (and dialogs containing forms) register while they hold edits the
// user has not saved. Navigating to another page, closing the dialog, or leaving the site then asks
// before the edits are thrown away.
import { useEffect, useId } from 'react';

const dirty = new Set<string>();
const MESSAGE = 'You have unsaved changes. Leave without saving?';

export const hasUnsavedChanges = () => dirty.size > 0;
export const markDirty = (id: string, on: boolean) => { if (on) dirty.add(id); else dirty.delete(id); };

/** Ask before discarding. Returns true when it is fine to go on (nothing unsaved, or the user agreed). */
export function confirmDiscard(only?: string): boolean {
  const pending = only ? dirty.has(only) : dirty.size > 0;
  if (!pending) return true;
  // eslint-disable-next-line no-alert
  const ok = window.confirm(MESSAGE);
  if (ok) { if (only) dirty.delete(only); else dirty.clear(); }
  return ok;
}

/** Register a page-level form's dirty state (dialogs do this themselves, see useDialog). */
export function useUnsavedChanges(isDirty: boolean, key?: string): string {
  const auto = useId();
  const id = key ?? auto;
  useEffect(() => { markDirty(id, isDirty); return () => markDirty(id, false); }, [id, isDirty]);
  return id;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', e => {
    if (dirty.size === 0) return;
    e.preventDefault();
    e.returnValue = MESSAGE;
  });
}
