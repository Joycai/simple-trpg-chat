"use client";

/**
 * Quick-check panel — the ◎ button left of the chat input.
 *
 * Lets a player pick one of their own stats (stored skills / sheet attributes
 * / checkable resources) and roll the room rule's check without typing the
 * command. Entirely capability-driven: `capabilities.quickCheckPanel` (pure
 * data) declares which pickers and dice fields render, and the rule's
 * `buildCheckCommand` turns the panel state into the exact `.rc`-family
 * command a player could have typed — the panel never rolls and never learns
 * any rule's syntax, so the one server-side check flow stays the single
 * resolver. Rules without the capability (triangle) never show the button.
 *
 * Data is fetched fresh on every open (skills via `getMySkillsAction`, sheet
 * via `getCharacterDataAction`) — the panel is conditionally rendered, so a
 * mount IS an open, and stale client copies can never seed a wrong preview.
 * Commands omit stored values anyway (the server re-resolves them); values
 * here only drive the list display and the roll-button preview.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { useRoomRule } from "@/components/shared/host-label";
import { useOverlayTransition } from "@/lib/useOverlayTransition";
import { getMySkillsAction } from "@/app/actions/skills";
import { getCharacterDataAction } from "@/app/actions/character";
import type { CharacterData } from "@/lib/character-types";

interface QuickCheckPanelProps {
  roomId: number;
  /** Receives the finished command string (e.g. ".rc 侦查+1"); the panel never rolls. */
  onSubmit: (command: string) => void;
  onClose: () => void;
}

interface Entry {
  kind: "skill" | "attribute" | "resource";
  /** Canonical name embedded in the command (language-neutral, e.g. 理智值). */
  name: string;
  /** Display label (localized for attributes/resources; the raw skill name otherwise). */
  label: string;
  value: number;
}

/** MRU list of entry names last rolled from this panel, per room. */
const recentKey = (roomId: number) => `strpg:quick-check-recent:${roomId}`;

function readRecent(roomId: number): string[] {
  try {
    const raw = localStorage.getItem(recentKey(roomId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function pushRecentName(roomId: number, name: string) {
  try {
    const next = [name, ...readRecent(roomId).filter((n) => n !== name)].slice(0, 8);
    localStorage.setItem(recentKey(roomId), JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode) — recency is a nicety, not state.
  }
}

/** Shared stepper row used by the modifier / 加骰 / 时髦骰 fields. */
function StepperRow({ label, value, min, max, display, onChange, decLabel, incLabel }: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (v: number) => void;
  decLabel: string;
  incLabel: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-theme border border-dashed border-border px-3 py-1.5">
      <span className="text-xs text-text-muted">{label}</span>
      <div className="ml-auto flex items-center gap-1">
        <button onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={decLabel}
          className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-surface-alt text-text-muted hover:text-text transition cursor-pointer">
          <Icons.Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-9 text-center font-bold font-theme-mono text-sm text-text">{display}</span>
        <button onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={incLabel}
          className="w-7 h-7 flex items-center justify-center rounded-theme hover:bg-surface-alt text-text-muted hover:text-text transition cursor-pointer">
          <Icons.Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function QuickCheckPanel({ roomId, onSubmit, onClose }: QuickCheckPanelProps) {
  const t = useTranslations("quickCheck");
  const tChar = useTranslations("character");
  const rule = useRoomRule();
  const spec = rule.capabilities.quickCheckPanel;

  const { close, panelRef } = useOverlayTransition(onClose, "popover");

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [recent, setRecent] = useState<string[]>([]);

  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  // Dice extras — only the ones the spec declares ever render or get sent.
  const [bonusPenalty, setBonusPenalty] = useState(0);
  const [advantage, setAdvantage] = useState(0);
  const [modifier, setModifier] = useState(0);
  const [bonusDice, setBonusDice] = useState(0);
  const [styleDice, setStyleDice] = useState(0);
  const [dcText, setDcText] = useState("");
  const [freeName, setFreeName] = useState("");
  const [hidden, setHidden] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Fetch fresh on mount (= on open). Attributes/resources flatten through the
  // rule's own readers, so this component never touches a rule-specific bag.
  useEffect(() => {
    if (!spec) return;
    let alive = true;
    void (async () => {
      try {
        const needsSheet = spec.attributes || (spec.resourceKeys?.length ?? 0) > 0;
        const [skills, sheet] = await Promise.all([
          spec.skills ? getMySkillsAction(roomId) : Promise.resolve([]),
          needsSheet ? getCharacterDataAction(roomId) : Promise.resolve(null),
        ]);
        if (!alive) return;

        const list: Entry[] = [];
        if (spec.attributes && sheet) {
          const values = rule.readAttributes(sheet as CharacterData);
          for (const { key, labelKey } of rule.capabilities.attributeKeys) {
            if (typeof values[key] !== "number") continue;
            list.push({
              kind: "attribute",
              name: rule.canonicalStatName(key),
              label: tChar(labelKey),
              value: values[key],
            });
          }
        }
        if (spec.resourceKeys?.length && sheet) {
          const status = rule.readStatus(sheet as CharacterData);
          for (const key of spec.resourceKeys) {
            const res = status.resources[key];
            if (!res) continue;
            const bar = rule.capabilities.resourceBars.find((b) => b.key === key);
            list.push({
              kind: "resource",
              name: rule.canonicalStatName(key),
              label: bar ? tChar(bar.labelKey) : key,
              value: res.current,
            });
          }
        }
        for (const s of skills) {
          list.push({ kind: "skill", name: s.skillName, label: s.skillName, value: s.skillValue });
        }
        setEntries(list);
        setRecent(readRecent(roomId));
      } catch {
        if (alive) setEntries([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // Mount-only by design: the panel remounts per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) => e.label.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
    );
  }, [entries, query]);
  // O(1) cursor-index lookup for the render below — the per-chip
  // `filtered.indexOf(e)` was O(n²) across the list on every keystroke.
  const filteredIndex = useMemo(
    () => new Map(filtered.map((e, i) => [e, i] as const)),
    [filtered]
  );

  // Keep the keyboard cursor inside the filtered list as the query narrows it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(0);
  }, [query]);

  const selected = useMemo(
    () => entries.find((e) => e.name === selectedName) ?? null,
    [entries, selectedName]
  );

  const recentEntries = useMemo(
    () => recent.map((n) => entries.find((e) => e.name === n)).filter((e): e is Entry => !!e).slice(0, 4),
    [recent, entries]
  );

  const selectEntry = (e: Entry) => {
    setSelectedName(e.name);
    // roll20-style seed: a stored d20 skill's value IS its flat bonus.
    if (spec?.modifierField && e.kind === "skill") setModifier(e.value);
  };

  const dcValue = (() => {
    const trimmed = dcText.trim();
    if (!trimmed) return undefined;
    const n = parseInt(trimmed, 10);
    return Number.isFinite(n) ? n : undefined;
  })();

  const input = {
    name: spec?.nameField === "optionalText" ? freeName : selected?.name ?? "",
    value: selected?.value,
    dc: dcValue,
    modifier,
    bonusPenalty,
    advantage,
    bonusDice,
    styleDice,
    hidden,
  };
  const built = spec ? rule.buildCheckCommand?.(input) ?? null : null;

  const handleRoll = () => {
    if (!built) return;
    if (input.name) pushRecentName(roomId, input.name);
    onSubmit(built.command);
    close();
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.nativeEvent.isComposing) return;
      const hit = filtered[cursor];
      if (hit) selectEntry(hit);
    } else if (e.key === "Escape") {
      close();
    }
  };

  if (!spec) return null;

  const showList = spec.skills || spec.attributes || (spec.resourceKeys?.length ?? 0) > 0;
  const attributeEntries = filtered.filter((e) => e.kind === "attribute");
  const resourceEntries = filtered.filter((e) => e.kind === "resource");
  const skillEntries = filtered.filter((e) => e.kind === "skill");
  // d100-style stored values read as percentages; modifier-style rules (d20)
  // read as signed bonuses and get no bar.
  const signedValues = !!spec.modifierField;
  const fmtValue = (v: number) => (signedValues && v >= 0 ? `+${v}` : `${v}`);

  const entryChip = (e: Entry, idx?: number) => (
    <button
      key={`${e.kind}-${e.name}`}
      onClick={() => selectEntry(e)}
      className={`px-2.5 py-1.5 rounded-theme border text-xs transition cursor-pointer inline-flex items-baseline gap-1.5 ${
        selectedName === e.name
          ? "border-accent/60 bg-accent/10 text-accent"
          : idx !== undefined && idx === cursor
            ? "border-primary/50 bg-primary/5 text-text"
            : "border-border text-text hover:bg-surface-alt"
      }`}
    >
      <span>{e.label}</span>
      <span className="font-theme-mono font-bold">{fmtValue(e.value)}</span>
    </button>
  );

  return (
    /* origin-bottom so the popover scales out of the input bar below it. */
    <div ref={panelRef} className="bg-surface border border-border rounded-theme shadow-lg origin-bottom overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <Icons.Target className="w-4 h-4 text-accent shrink-0" />
        <h4 className="font-bold text-sm text-text">{t("title")}</h4>
        <button
          onClick={close}
          className="ml-auto text-text-muted hover:text-text transition cursor-pointer"
          aria-label={t("title")}
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Search + pickable stat lists (select-style rules) */}
        {showList && (
          <>
            <div className="relative">
              <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("searchPlaceholder")}
                className="w-full bg-input-bg border border-input-border rounded-theme pl-9 pr-16 py-2 text-sm text-text outline-none focus:ring-1 focus:ring-accent"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-dim border border-border rounded px-1.5 py-0.5 select-none pointer-events-none">
                {t("selectHint")}
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[38vh] overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-text-muted text-xs">
                  <Icons.Loader2 className="w-4 h-4 animate-spin" />
                </div>
              ) : (
                <>
                  {recentEntries.length > 0 && !query && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-bold tracking-widest text-text-dim font-theme-mono">{t("recentLabel")}</span>
                        <span className="text-[10px] text-text-dim">{t("recentSortHint")}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {recentEntries.map((e) => entryChip(e))}
                      </div>
                    </div>
                  )}

                  {(attributeEntries.length > 0 || resourceEntries.length > 0) && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold tracking-widest text-text-dim font-theme-mono">{t("attributesLabel")}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {[...attributeEntries, ...resourceEntries].map((e) =>
                          entryChip(e, filteredIndex.get(e) ?? -1)
                        )}
                      </div>
                    </div>
                  )}

                  {skillEntries.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-bold tracking-widest text-text-dim font-theme-mono">{t("skillsLabel")}</span>
                        <span className="text-[10px] text-text-dim font-theme-mono">{skillEntries.length}</span>
                      </div>
                      {skillEntries.map((e) => {
                        const idx = filteredIndex.get(e) ?? -1;
                        return (
                          <button
                            key={`skill-${e.name}`}
                            onClick={() => selectEntry(e)}
                            className={`flex items-center gap-3 rounded-theme border px-3 py-2 text-sm transition cursor-pointer ${
                              selectedName === e.name
                                ? "border-accent/60 bg-accent/10 text-accent"
                                : idx === cursor
                                  ? "border-primary/50 bg-primary/5 text-text"
                                  : "border-border text-text hover:bg-surface-alt"
                            }`}
                          >
                            <span className="truncate">{e.label}</span>
                            {!signedValues && (
                              <span className="flex-1 h-1 rounded-full bg-border/60 overflow-hidden min-w-8">
                                <span
                                  className="block h-full rounded-full bg-accent/70"
                                  style={{ width: `${Math.min(100, Math.max(0, e.value))}%` }}
                                />
                              </span>
                            )}
                            <span className={`font-theme-mono font-bold shrink-0 ${signedValues ? "ml-auto" : ""}`}>
                              {fmtValue(e.value)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {filtered.length === 0 && (
                    <p className="text-xs text-text-dim border border-dashed border-border rounded-theme py-6 text-center">
                      {entries.length === 0 ? t("emptyList") : t("emptyFiltered")}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Free-text check name (狩魂者 — may stay empty for the nameless shorthand) */}
        {spec.nameField === "optionalText" && (
          <div className="flex items-center gap-2 rounded-theme border border-dashed border-border px-3 py-1.5">
            <span className="text-xs text-text-muted shrink-0">{t("nameLabel")}</span>
            <input
              value={freeName}
              onChange={(e) => setFreeName(e.target.value.slice(0, 50))}
              placeholder={t("namePlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm text-text outline-none text-right"
            />
          </div>
        )}

        {/* Dice extras — every field is spec-gated */}
        {spec.bonusPenaltyDice && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{t("bpLabel")}</span>
            <div className="ml-auto flex items-center gap-1">
              {Array.from({ length: spec.bonusPenaltyDice.max * 2 + 1 }, (_, i) => i - spec.bonusPenaltyDice!.max).map((n) => (
                <button
                  key={n}
                  onClick={() => setBonusPenalty(n)}
                  aria-pressed={bonusPenalty === n}
                  className={`px-2.5 py-1.5 rounded-theme border text-xs transition cursor-pointer ${
                    bonusPenalty === n
                      ? "border-accent/60 bg-accent/10 text-accent font-bold"
                      : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                  }`}
                >
                  {n === 0 ? t("bpNone") : n > 0 ? t("bpBonus", { count: n }) : t("bpPenalty", { count: -n })}
                </button>
              ))}
            </div>
          </div>
        )}

        {spec.advantageField && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">{t("advLabel")}</span>
            <div className="ml-auto flex items-center gap-1">
              {([-1, 0, 1] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setAdvantage(n)}
                  aria-pressed={advantage === n}
                  className={`px-2.5 py-1.5 rounded-theme border text-xs transition cursor-pointer ${
                    advantage === n
                      ? "border-accent/60 bg-accent/10 text-accent font-bold"
                      : "border-border text-text-muted hover:text-text hover:bg-surface-alt"
                  }`}
                >
                  {n === 0 ? t("advNone") : n > 0 ? t("advAdvantage") : t("advDisadvantage")}
                </button>
              ))}
            </div>
          </div>
        )}

        {spec.modifierField && (
          <StepperRow
            label={t("modifierLabel")}
            value={modifier}
            min={-99}
            max={99}
            display={modifier > 0 ? `+${modifier}` : `${modifier}`}
            onChange={setModifier}
            decLabel={t("decrease")}
            incLabel={t("increase")}
          />
        )}

        {spec.bonusDiceField && (
          <StepperRow
            label={t("bonusDiceLabel")}
            value={bonusDice}
            min={0}
            max={spec.bonusDiceField.max}
            display={`${bonusDice}`}
            onChange={setBonusDice}
            decLabel={t("decrease")}
            incLabel={t("increase")}
          />
        )}

        {spec.styleDiceField && (
          <StepperRow
            label={t("styleDiceLabel")}
            value={styleDice}
            min={spec.styleDiceField.min}
            max={spec.styleDiceField.max}
            display={styleDice > 0 ? `+${styleDice}` : `${styleDice}`}
            onChange={setStyleDice}
            decLabel={t("decrease")}
            incLabel={t("increase")}
          />
        )}

        {spec.dcField && (
          <div className="flex items-center gap-2 rounded-theme border border-dashed border-border px-3 py-1.5">
            <span className="text-xs text-text-muted shrink-0">{t("dcLabel")}</span>
            <input
              value={dcText}
              onChange={(e) => setDcText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder={t("dcPlaceholder")}
              className="flex-1 min-w-0 bg-transparent text-sm text-text outline-none text-right font-theme-mono"
            />
          </div>
        )}

        {/* Footer: 暗骰 toggle + roll button with live command preview */}
        <div className="flex items-center gap-2">
          {spec.hiddenToggle && (
            <button
              onClick={() => setHidden((h) => !h)}
              aria-pressed={hidden}
              title={t("hiddenHint")}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 rounded-theme border text-xs transition cursor-pointer shrink-0 ${
                hidden
                  ? "bg-private-bg text-accent border-private-border"
                  : "bg-surface-alt text-text-muted border-transparent hover:text-text"
              }`}
            >
              <Icons.EyeOff className="w-4 h-4" />
              {t("hidden")}
            </button>
          )}
          <button
            onClick={handleRoll}
            disabled={!built}
            className="flex-1 min-w-0 bg-accent hover:bg-accent-hover text-accent-foreground font-bold py-2.5 px-4 rounded-theme transition flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            <Icons.Dices className="w-4 h-4 shrink-0" />
            <span className="truncate">
              {built
                ? input.name
                  ? t("rollNamed", { name: input.name, preview: built.preview })
                  : t("rollPreview", { preview: built.preview })
                : t("selectFirst")}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
