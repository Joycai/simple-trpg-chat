"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a popover when the user mousedowns anywhere outside `ref`.
 *
 * Preferred over a `fixed inset-0` click-catcher because that backdrop is
 * clipped to the nearest ancestor with `backdrop-filter`/`transform` (which
 * establishes a containing block for `position: fixed`) — e.g. the rainglass
 * header/sidebar — so it never covers the rest of the viewport. A document
 * listener has no such limitation.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active = true,
) {
  useEffect(() => {
    if (!active) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside, active]);
}
