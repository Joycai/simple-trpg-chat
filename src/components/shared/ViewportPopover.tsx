"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject, type MouseEventHandler } from "react";
import { createPortal } from "react-dom";
import { useEscapeToClose } from "@/lib/ui/overlay-esc";

interface Props {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  width?: number;
  onClick?: MouseEventHandler<HTMLDivElement>;
}

/** Portaling avoids clipping by frosted headers; clamp both axes after wrapping,
 * rotation, scrolling, and visual-viewport changes (including a soft keyboard). */
export function ViewportPopover({ anchorRef, onClose, children, className = "", width = 288, onClick }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, width, maxHeight: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const right = left + (viewport?.width ?? window.innerWidth) - 16;
      const bottom = top + (viewport?.height ?? window.innerHeight) - 16;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = Math.min(width, right - left);
      const below = Math.max(0, bottom - rect.bottom - 4);
      const above = Math.max(0, rect.top - top - 4);
      const flip = below < menu.scrollHeight && above > below;
      const maxHeight = Math.min(bottom - top, flip ? above : below);
      const height = Math.min(menu.scrollHeight, maxHeight);
      const next = {
        left: Math.max(left, Math.min(rect.right - menuWidth, right - menuWidth)),
        top: Math.max(top, Math.min(flip ? rect.top - height - 4 : rect.bottom + 4, bottom - height)),
        width: menuWidth,
        maxHeight,
      };
      setPosition((prev) => Object.keys(next).every((key) => prev[key as keyof typeof next] === next[key as keyof typeof next]) ? prev : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (anchorRef.current) observer.observe(anchorRef.current);
    if (menuRef.current) observer.observe(menuRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!anchorRef.current?.contains(target) && !menuRef.current?.contains(target)) onClose();
    };
    document.addEventListener("pointerdown", outside);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      document.removeEventListener("pointerdown", outside);
    };
  }, [anchorRef, width, onClose]);

  useEscapeToClose(onClose);

  return createPortal(
    <div ref={menuRef} data-viewport-popover style={position} onClick={onClick}
      className={`fixed z-40 overflow-y-auto overscroll-contain ${className}`}>
      {children}
    </div>,
    document.body,
  );
}
