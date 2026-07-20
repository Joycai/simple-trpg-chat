import { createPortal } from "react-dom";
import { Info, Sparkles } from "lucide-react";
import { type CharacterData } from "@/lib/character-types";
import { useTranslations } from "next-intl";
import { getRule } from "@/lib/rules";
import { RESOURCE_ICON, DERIVED_ICON, DEFAULT_RESOURCE_COLOR } from "@/components/room/character/resource-visuals";

interface ResourceStatusTooltipProps {
  loading: boolean;
  charData: CharacterData | null;
  nickname: string;
  coords: { top: number; left: number } | null;
}

/** Remaining-ratio tone for bars that opt into it (HP): green → amber → red. */
function ratioColor(pct: number): string {
  return pct > 50 ? "var(--theme-success)" : pct > 25 ? "var(--theme-accent)" : "var(--theme-danger)";
}

/**
 * Hover card shown over a chat avatar: a read-only glance at whatever the
 * room's rule considers a character's live status.
 *
 * Fully capability-driven — the rule declares which bars, derived stats and
 * compact attributes exist (`resourceBars` / `derivedStats` /
 * `statusAttributeKeys`) and `rule.readStatus()` flattens its own sheet bag
 * into those keys. Adding a rule therefore needs no change here: COC shows
 * HP/SAN/MP + 幸运, 狩魂者 shows HP/灵力值 + 术法强度 + graded attributes,
 * d20 shows HP, Triangle shows its two counters. Custom attributes the
 * player typed themselves render underneath for every rule.
 */
export function ResourceStatusTooltip({
  loading,
  charData,
  nickname,
  coords,
}: ResourceStatusTooltipProps) {
  const tChat = useTranslations("chat");
  const tChar = useTranslations("character");

  if (!coords) return null;

  const rule = getRule(charData?.ruleTemplate);
  const cap = rule.capabilities;
  const status = charData ? rule.readStatus(charData) : null;

  // A bar/counter renders only when the rule actually returned a value for
  // its key — an uninitialized sheet shows "unavailable" rather than zeros.
  const resources = status
    ? cap.resourceBars.flatMap(spec => {
        const v = status.resources[spec.key];
        return v ? [{ spec, ...v }] : [];
      })
    : [];
  const derived = status?.derived
    ? (cap.derivedStats ?? []).flatMap(spec => {
        const v = status.derived?.[spec.key];
        return typeof v === "number" ? [{ spec, value: v }] : [];
      })
    : [];
  const attributes = status?.attributes
    ? (cap.statusAttributeKeys ?? []).flatMap(spec => {
        const value = status.attributes?.[spec.key];
        return typeof value === "number"
          ? [{ ...spec, value, grade: status.attributeGrades?.[spec.key] }]
          : [];
      })
    : [];
  const customAttrs = charData?.customAttributes ?? [];

  const hasStatus = !loading && (
    resources.length > 0 || derived.length > 0 || attributes.length > 0 || customAttrs.length > 0
  );

  return createPortal(
    <div
      className="fixed w-52 bg-surface/95 backdrop-blur-md border border-border shadow-2xl rounded-theme p-3 text-xs text-text flex flex-col gap-2.5 select-none transition-all duration-200 animate-in fade-in zoom-in-95 duration-150 z-[100]"
      style={{ top: coords.top, left: coords.left }}
      onClick={(e) => e.stopPropagation()}
    >
      {loading ? (
        <div className="flex items-center gap-2 py-1.5 justify-center text-text-muted">
          <span className="animate-spin inline-block w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full" />
          <span>{tChat("loading")}</span>
        </div>
      ) : !hasStatus ? (
        <div className="text-center py-2 text-text-dim flex flex-col items-center gap-1">
          <Info className="w-5 h-5" />
          <span className="font-medium">{tChat("resourceUnavailable")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Character Name / Nickname */}
          <div className="font-bold border-b border-border/60 pb-1 text-text truncate max-w-full">
            {nickname}
          </div>

          {/* Rule-preset resources: "bar" style renders current/max with a
              fill; "counter" style (Triangle's 嘉奖/处分) is a bare value. */}
          {resources.length > 0 && (
            <div className="flex flex-col gap-2">
              {resources.map(({ spec, current, max }) => {
                const visual = RESOURCE_ICON[spec.key];
                const Icon = visual?.Icon;
                const isCounter = (spec.style ?? "bar") === "counter" || max === undefined;
                const pct = max && max > 0 ? Math.min(100, (current / max) * 100) : 0;
                const color = visual?.ratioTone ? ratioColor(pct) : visual?.color ?? DEFAULT_RESOURCE_COLOR;
                return (
                  <div key={spec.key}>
                    <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {Icon && <Icon className="w-3 h-3" />} {tChar(spec.labelKey)}
                      </span>
                      <span className={`font-mono ${isCounter ? "font-bold text-text" : ""}`}>
                        {isCounter ? current : `${current}/${max}`}
                      </span>
                    </div>
                    {!isCounter && (
                      <div className="h-2 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${pct}%`, backgroundColor: `rgb(${color})` }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Read-only derived stats (狩魂者 术法强度) — computed on read. */}
          {derived.map(({ spec, value }) => {
            const Icon = DERIVED_ICON[spec.key] ?? Sparkles;
            return (
              <div key={spec.key}
                className="flex justify-between text-[10px] text-text-muted border-t border-border/40 pt-1.5 font-medium">
                <span className="inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {tChar(spec.labelKey)}</span>
                <span className="font-mono font-bold text-text">{value}</span>
              </div>
            );
          })}

          {/* Compact attributes the rule opted into (COC 幸运; 狩魂者's three
              base attributes with their E..SSS+ grades). */}
          {attributes.length > 0 && (
            attributes.length === 1 ? (
              <div className="flex justify-between text-[10px] text-text-muted border-t border-border/40 pt-1.5 font-medium">
                <span>{tChar(attributes[0].labelKey)}</span>
                <span className="font-mono font-bold text-text">
                  {attributes[0].value}
                  {attributes[0].grade && <span className="text-text-dim font-medium"> {attributes[0].grade}</span>}
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 border-t border-border/40 pt-1.5">
                {attributes.map(a => (
                  <div key={a.key} className="flex flex-col items-center gap-0.5 rounded bg-surface-alt/60 border border-border/40 py-1">
                    <span className="text-[10px] text-text-muted font-medium truncate max-w-full px-1">{tChar(a.labelKey)}</span>
                    <span className="font-mono font-bold text-text text-xs">
                      {a.value} {a.grade && <span className="text-text-dim font-medium">{a.grade}</span>}
                    </span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* Custom Resource Bars (player-defined, any rule) */}
          {customAttrs.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {customAttrs.map((attr) => (
                <div key={attr.name} className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-[10px] text-text-muted font-medium">
                    <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> {attr.name}</span>
                    <span className="font-mono">
                      {attr.value}
                      {attr.max !== undefined && `/${attr.max}`}
                    </span>
                  </div>
                  {attr.max !== undefined && attr.max > 0 && (
                    <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{
                          width: `${Math.min(100, (attr.value / attr.max) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}
