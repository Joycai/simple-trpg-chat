"use client";

import { useState, useEffect, useLayoutEffect, useCallback } from "react";

// Run before the browser paints on the client, but fall back to useEffect during
// SSR so React doesn't warn. Used to settle the sidebar's collapsed state ahead
// of the first paint so it never flashes open then closes on room entry.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* Owns the conversation sidebar's width / collapsed / mobile state, persists
   width and collapsed to localStorage, and provides the drag-to-resize handler.
   Extracted from RoomClient. */
export function useSidebar() {
  const [width, setWidth] = useState<number>(200);
  const [collapsed, setCollapsedState] = useState<boolean>(false);
  // True only while actively dragging the resize handle, so the sidebar can
  // suppress its width transition (instant drag) without losing the smooth
  // collapse/expand animation.
  const [resizing, setResizing] = useState<boolean>(false);
  // False until the first viewport check runs; gates the open/close animation
  // so the initial collapsed state doesn't slide on page load.
  const [hydrated, setHydrated] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Load saved width on mount.
  useEffect(() => {
    const savedWidth = localStorage.getItem("trpg-sidebar-width");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedWidth) setWidth(Number(savedWidth));
  }, []);

  // Settle the collapsed state before the first paint so entering a room shows
  // the sidebar already in its correct state — never open-then-close.
  useIsomorphicLayoutEffect(() => {
    const checkIsMobile = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsedState(true);
      } else {
        const savedCollapsed = localStorage.getItem("trpg-sidebar-collapsed");
        setCollapsedState(savedCollapsed === "true");
      }
    };
    checkIsMobile();
    window.addEventListener("resize", checkIsMobile);
    return () => window.removeEventListener("resize", checkIsMobile);
  }, []);

  // Enable the open/close transition only on the frame after the initial state
  // has been applied. Doing it in a later commit (not the same one as the
  // collapse above) means the on-load state snaps in without animating, while
  // every subsequent user toggle still animates.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const setCollapsed = useCallback((val: boolean) => {
    setCollapsedState(val);
    localStorage.setItem("trpg-sidebar-collapsed", String(val));
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      localStorage.setItem("trpg-sidebar-collapsed", String(next));
      return next;
    });
  }, []);

  const resetWidth = useCallback(() => {
    setWidth(200);
    localStorage.setItem("trpg-sidebar-width", "200");
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      // Constraint width between 160px and 360px
      const newWidth = Math.max(160, Math.min(360, startWidth + deltaX));
      setWidth(newWidth);
      localStorage.setItem("trpg-sidebar-width", String(newWidth));
    };

    const handleMouseUp = () => {
      setResizing(false);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [width]);

  return { width, collapsed, resizing, hydrated, isMobile, setCollapsed, toggleCollapsed, resetWidth, handleResizeStart };
}
