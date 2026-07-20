"use client";

import { Dices, type LucideIcon } from "lucide-react";
import { listRules } from "@/lib/rules";
import { BadgeDropdown, type BadgeDropdownItem } from "./BadgeDropdown";

interface RuleTemplateSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (id: string) => void;
  /**
   * Translator bound to the caller's i18n namespace. Used to resolve
   * `rule.labelKey`, the matching `<labelKey>Desc` description key, and
   * `ruleSystemHeader` for the menu header.
   */
  t: (key: string) => string;
  disabled?: boolean;
}

const RULE_BADGES: Record<string, { letters?: string; Icon?: LucideIcon }> = {
  basic: { Icon: Dices },
  coc7th: { letters: "7E" },
  dnd5e: { letters: "5E" },
  triangle: { letters: "TA" },
  shouhun: { letters: "狩" },
};

export function RuleTemplateSelect({ id, name, value, onChange, t, disabled }: RuleTemplateSelectProps) {
  const items: BadgeDropdownItem[] = listRules().map((rule) => {
    const descKey = `${rule.labelKey}Desc`;
    const desc = t(descKey);
    return {
      id: rule.id,
      label: t(rule.labelKey),
      description: desc && desc !== descKey ? desc : undefined,
      badge: RULE_BADGES[rule.id] ?? { letters: rule.id.slice(0, 2).toUpperCase() },
    };
  });

  return (
    <BadgeDropdown
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      items={items}
      headerText={t("ruleSystemHeader")}
      tone="primary"
      disabled={disabled}
    />
  );
}
