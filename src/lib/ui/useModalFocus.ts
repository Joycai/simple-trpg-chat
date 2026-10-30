'use client';
import { useEffect, type RefObject } from 'react';
const stack: HTMLElement[] = [];
/** Portaled listboxes belong to the top modal; background dialogs never receive Tab. */
export function useModalFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    stack.push(panel);
    panel.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || stack.at(-1) !== panel) return;
      const menu = document.querySelector<HTMLElement>('[role="listbox"]');
      // BadgeDropdown owns Tab while a portaled menu is open.
      if (menu?.contains(document.activeElement)) return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea:not(:disabled),input:not(:disabled),[tabindex="0"],summary')).filter(el => el.getClientRects().length > 0);
      if (!controls.length) { event.preventDefault(); return; }
      const current = controls.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && (current < 0 || current === controls.length - 1)) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      const index = stack.indexOf(panel);
      if (index >= 0) stack.splice(index, 1);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [ref]);
}
