"use client";

import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { ROOM_HOTKEYS, formatHotkey, isMacPlatform } from "@/lib/hotkeys";

interface RoomHotkeyHelpProps {
  isHost: boolean;
  onClose: () => void;
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface-alt text-text text-[11px] font-theme-mono whitespace-nowrap shadow-sm">
      {children}
    </kbd>
  );
}

function Row({ label, keys }: { label: string; keys: string[] }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.5 rounded-theme hover:bg-surface-alt transition">
      <span className="text-sm text-text">{label}</span>
      <span className="flex items-center gap-1 shrink-0">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </div>
  );
}

/** The Alt+/ shortcut reference sheet, also reachable from the gear menu. */
export function RoomHotkeyHelp({ isHost, onClose }: RoomHotkeyHelpProps) {
  const t = useTranslations("hotkeys");
  const tCommon = useTranslations("common");
  const isMac = isMacPlatform();

  const bindings = ROOM_HOTKEYS.filter((b) => !b.hostOnly || isHost);
  const panelRows = bindings.filter((b) => !["prev-tab", "next-tab", "help"].includes(b.action));
  const navRows = bindings.filter((b) => ["prev-tab", "next-tab", "help"].includes(b.action));

  return (
    <OverlayShell
      onClose={onClose}
      portal
      panelClassName="w-full max-w-md mx-4 bg-surface theme-border rounded-theme shadow-2xl overflow-hidden font-theme max-h-[85dvh] flex flex-col"
    >
      {(close) => (
        <>
          <div className="px-5 py-4 border-b border-border flex items-center gap-3 shrink-0">
            <span className="w-9 h-9 rounded-theme shrink-0 flex items-center justify-center border bg-primary/12 text-primary border-primary/30">
              <Icons.Keyboard className="w-5 h-5" />
            </span>
            <h4 className="font-bold text-text text-lg font-theme-display flex-1">{t("title")}</h4>
            <button
              onClick={close}
              className="text-text-muted hover:text-text p-1 rounded-theme hover:bg-surface-alt transition cursor-pointer"
              aria-label={tCommon("close")}
            >
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-3 overflow-y-auto">
            <p className="px-3 pb-2 text-[11px] font-bold text-text-dim uppercase tracking-wider select-none">
              {t("sectionPanels")}
            </p>
            {panelRows.map((b) => (
              <Row key={b.action} label={t(b.labelKey)} keys={[formatHotkey(b.code, isMac)]} />
            ))}

            <p className="px-3 pt-3 pb-2 text-[11px] font-bold text-text-dim uppercase tracking-wider select-none">
              {t("sectionChat")}
            </p>
            <Row label={t("send")} keys={["Enter"]} />
            <Row label={t("newline")} keys={["Shift+Enter"]} />
            <Row label={t("closeOverlay")} keys={["Esc"]} />
            <Row label={t("focusInput")} keys={[t("focusInputKey")]} />
            {navRows.map((b) => (
              <Row key={b.action} label={t(b.labelKey)} keys={[formatHotkey(b.code, isMac)]} />
            ))}
          </div>
        </>
      )}
    </OverlayShell>
  );
}
