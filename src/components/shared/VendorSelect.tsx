"use client";

import { SlidersHorizontal } from "lucide-react";
import { BadgeDropdown, type BadgeDropdownItem } from "./BadgeDropdown";
import { AI_VENDORS, COMPAT_VENDOR_ID, shortHost } from "@/lib/provider-presets";

interface VendorSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (id: string) => void;
  /**
   * Translator bound to the caller's i18n namespace (typically `adminProviders`).
   * Must resolve `vendorCompat`, `vendorCompatDesc`, and `vendorHeader`.
   */
  t: (key: string) => string;
  disabled?: boolean;
}

export function VendorSelect({ id, name, value, onChange, t, disabled }: VendorSelectProps) {
  const items: BadgeDropdownItem[] = AI_VENDORS.map((v) =>
    v.id === COMPAT_VENDOR_ID
      ? {
          id: v.id,
          label: t("vendorCompat"),
          description: t("vendorCompatDesc"),
          badge: { Icon: SlidersHorizontal },
        }
      : {
          id: v.id,
          label: v.name,
          description: `${v.models[0]?.id ?? ""} · ${shortHost(v.endpoint)}`,
          descriptionMono: true,
          badge: { letters: v.badgeLetters },
        },
  );

  return (
    <BadgeDropdown
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      items={items}
      headerText={t("vendorHeader")}
      tone="accent"
      disabled={disabled}
    />
  );
}
