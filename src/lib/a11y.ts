import type { KeyboardEvent } from 'react';

/** Enter / Space on the element itself (not on a button or field inside it) runs the action, like a click. */
export function onActivateKey(action: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}

/** Props that make a clickable card / list item (a non-button element) reachable and usable from the keyboard. */
export function pressable(action: () => void) {
  return { role: 'button' as const, tabIndex: 0, onClick: action, onKeyDown: onActivateKey(action) };
}

/** onKeyDown for a clickable element that is not a button: Enter / Space on it fires its own click handler. */
export function clickOnKey(e: KeyboardEvent<HTMLElement>) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    e.currentTarget.click();
  }
}

/** Spread on a clickable <div>/<span> (one with no buttons or links inside): announced as a button, reachable with Tab, Enter / Space click it. */
export const buttonLike = { role: 'button' as const, tabIndex: 0, onKeyDown: clickOnKey };
