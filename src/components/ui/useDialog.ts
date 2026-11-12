// Shared behaviour of every modal and drawer:
// * Escape closes the topmost dialog only; Tab stays inside it (focus trap);
// * focus moves into the dialog when it opens and back to where it was when it closes;
// * the page behind does not scroll;
// * when the user has typed into a form inside the dialog, closing it with Escape, the backdrop
//   or the close button asks before discarding (closing after a successful save is not asked);
// * on submit, the first invalid field (aria-invalid="true") receives focus.
import { useCallback, useEffect, useId, useRef, type RefObject } from 'react';
import { confirmDiscard, markDirty } from '../../lib/unsaved';

const stack: string[] = [];
let locks = 0;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

export function useDialog(isOpen: boolean, onClose: () => void, ref: RefObject<HTMLElement>, opts: { guardUnsaved?: boolean } = {}) {
  const id = useId();
  const guard = opts.guardUnsaved ?? true;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // user-initiated close (Escape, backdrop, X): ask first when the form was edited
  const requestClose = useCallback(() => {
    if (guard && !confirmDiscard(id)) return;
    markDirty(id, false);
    onCloseRef.current();
  }, [guard, id]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(id);
    if (locks++ === 0) document.body.style.overflow = 'hidden';
    const el = ref.current;

    // initial focus: first field (autofocus wins), else the dialog itself
    const t = window.setTimeout(() => {
      if (!el || el.contains(document.activeElement)) return;
      const auto = el.querySelector<HTMLElement>('[autofocus]');
      const field = el.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
      (auto ?? field ?? el).focus({ preventScroll: true });
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== id || !el) return;
      if (e.key === 'Escape') { e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(n => n.offsetParent !== null || n === document.activeElement);
      if (items.length === 0) { e.preventDefault(); el.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    // edits inside a <form> mark the dialog dirty
    const onInput = (e: Event) => { if (guard && (e.target as HTMLElement)?.closest?.('form')) markDirty(id, true); };
    // after a submit, focus the first invalid field once React has rendered the errors
    const onSubmit = () => window.setTimeout(() => {
      const bad = el?.querySelector<HTMLElement>('[aria-invalid="true"]');
      if (bad) bad.focus();
    }, 50);
    document.addEventListener('keydown', onKey, true);
    el?.addEventListener('input', onInput);
    el?.addEventListener('change', onInput);
    el?.addEventListener('submit', onSubmit, true);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      el?.removeEventListener('input', onInput);
      el?.removeEventListener('change', onInput);
      el?.removeEventListener('submit', onSubmit, true);
      const i = stack.lastIndexOf(id); if (i >= 0) stack.splice(i, 1);
      if (--locks === 0) document.body.style.overflow = '';
      markDirty(id, false);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [isOpen, id, ref, guard, requestClose]);

  return { requestClose, titleId: `${id}-title`, descriptionId: `${id}-desc` };
}
