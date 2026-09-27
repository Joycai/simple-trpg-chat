"use client";

import { useTranslations } from "next-intl";

/** Backdrop for the mobile sidebar drawer — stays mounted so it can fade in/out
 *  in step with the drawer slide. */
export function SidebarBackdrop({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: () => void }) {
  return (
    <div
      aria-hidden={collapsed}
      className={`fixed inset-0 bg-scrim/40 z-20 transition-opacity duration-300 ${
        collapsed ? "opacity-0 pointer-events-none" : "opacity-100 cursor-pointer"
      }`}
      onClick={onCollapse}
    />
  );
}

/** Desktop drag handle between the sidebar and the chat: drag to resize,
 *  double-click to reset, and a collapse button that shows on hover. */
export function SidebarResizeHandle({
  onResizeStart,
  onResetWidth,
  onCollapse,
}: {
  onResizeStart: (e: React.MouseEvent) => void;
  onResetWidth: () => void;
  onCollapse: () => void;
}) {
  const t = useTranslations("room");
  return (
    <div
      onMouseDown={onResizeStart}
      className="w-1 hover:w-1.5 active:w-1.5 h-full bg-border hover:bg-primary/50 active:bg-primary cursor-col-resize select-none transition-colors duration-150 shrink-0 relative z-10 group"
      title={t("tooltipResize")}
      onDoubleClick={onResetWidth}
    >
      {/* Collapse toggle button on the handle (like VS Code or Notion) */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-4 h-8 bg-surface border border-border hover:border-primary/50 rounded flex items-center justify-center shadow-md cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-20"
        onClick={(e) => {
          e.stopPropagation();
          onCollapse();
        }}
        title={t("tooltipCollapseSidebar")}
      >
        <span className="text-[9px] text-text-muted hover:text-primary select-none">◀</span>
      </div>
    </div>
  );
}
