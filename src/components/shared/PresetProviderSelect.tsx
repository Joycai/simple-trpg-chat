"use client";

import { SlidersHorizontal } from "lucide-react";
import { BadgeDropdown, type BadgeDropdownItem } from "./BadgeDropdown";
import { CUSTOM_PRESET_ID, PROVIDER_PRESETS, shortHost } from "@/lib/provider-presets";

interface PresetProviderSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (id: string) => void;
  /**
   * Translator bound to the caller's i18n namespace (typically `adminProviders`).
   * Must resolve `presetCustom`, `presetCustomDesc`, and `providerPresetHeader`.
   */
  t: (key: string) => string;
  disabled?: boolean;
}

export function PresetProviderSelect({ id, name, value, onChange, t, disabled }: PresetProviderSelectProps) {
  const customDesc = t("presetCustomDesc");
  const items: BadgeDropdownItem[] = [
    ...PROVIDER_PRESETS.map((p) => ({
      id: p.id,
      label: p.name,
      description: `${p.model} · ${shortHost(p.endpoint)}`,
      descriptionMono: true,
      badge: { letters: p.badgeLetters },
    })),
    {
      id: CUSTOM_PRESET_ID,
      label: t("presetCustom"),
      description: customDesc && customDesc !== "presetCustomDesc" ? customDesc : undefined,
      badge: { Icon: SlidersHorizontal },
    },
  ];

  return (
    <BadgeDropdown
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      items={items}
      headerText={t("providerPresetHeader")}
      tone="accent"
      disabled={disabled}
    />
  );
}
