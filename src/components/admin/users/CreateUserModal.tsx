"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, X, User, Crosshair, Shield } from "lucide-react";
import { createUser } from "@/app/admin/actions";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { BadgeDropdown, type BadgeDropdownItem } from "@/components/shared/BadgeDropdown";

export function CreateUserModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin");
  const [role, setRole] = useState("player");

  const roleItems: BadgeDropdownItem[] = [
    { id: "player", label: t("rolePlayer"), badge: { Icon: User } },
    { id: "host", label: t("roleHost"), badge: { Icon: Crosshair } },
    { id: "admin", label: t("roleAdmin"), badge: { Icon: Shield } },
  ];

  return (
    <OverlayShell
      onClose={onClose}
      rootClassName="p-4"
      panelClassName="bg-surface theme-border border border-border rounded-theme shadow-2xl w-full max-w-md"
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h3 className="font-bold text-text text-lg font-theme-display flex items-center gap-2">
              <Plus className="w-5 h-5 text-primary" />
              {t("createUser")}
            </h3>
            <button onClick={close} className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>
          <form action={createUser} className="flex flex-col gap-3 p-5">
            <div className="grid grid-cols-2 gap-3">
              <input name="username" placeholder={t("username")} required
                className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              <input name="password" type="password" placeholder={t("password")} required
                className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              <input name="displayName" placeholder={t("displayName")} required
                className="px-3 py-2.5 bg-input-bg border border-input-border rounded-theme text-text text-sm placeholder:text-text-dim outline-none transition focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary" />
              <BadgeDropdown
                name="role"
                value={role}
                onChange={setRole}
                headerText={t("role")}
                tone="primary"
                items={roleItems}
              />
            </div>
            <button type="submit"
              className="mt-1 bg-gradient-to-b from-primary to-primary/85 hover:brightness-110 text-primary-foreground py-2.5 rounded-theme font-bold text-sm transition cursor-pointer shadow-[var(--theme-glow)]">
              {t("submit")}
            </button>
          </form>
        </>
      )}
    </OverlayShell>
  );
}
