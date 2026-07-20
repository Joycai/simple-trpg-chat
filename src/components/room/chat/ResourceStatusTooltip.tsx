import { createPortal } from "react-dom";
import { Info, Heart, Eye, Droplet, Clover, Sparkles, Wand2 } from "lucide-react";
import { computeShDerived, shGradeLabel, type CharacterData } from "@/lib/character-types";
import { useTranslations } from "next-intl";
import { getRule } from "@/lib/rules";

interface ResourceStatusTooltipProps {
  loading: boolean;
  charData: CharacterData | null;
  nickname: string;
  coords: { top: number; left: number } | null;
}

export function ResourceStatusTooltip({
  loading,
  charData,
  nickname,
  coords,
}: ResourceStatusTooltipProps) {
  const tChat = useTranslations("chat");
  const tChar = useTranslations("character");

  if (!coords) return null;

  const ruleCap = getRule(charData?.ruleTemplate).capabilities;
  // 狩魂者 maxes/strengths are never persisted — derive them from the stored
  // attributes on the fly (same helper the character panel uses).
  const shAttrs = charData?.ruleTemplate === "shouhun" ? charData.shAttributes : undefined;
  const shDerived = shAttrs ? computeShDerived(shAttrs) : null;
  // A rule with structured resources (e.g. COC's hasSanity, 狩魂者's derived
  // sheet) renders its preset bars when the sheet has the data; otherwise we
  // fall back to whatever the player put in customAttributes.
  const hasStatus = !loading && !!charData && (
    (ruleCap.hasSanity && !!charData.cocDerived) ||
    !!shDerived ||
    (charData.customAttributes && charData.customAttributes.length > 0)
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

          {/* Rule-preset resources (HP / SAN / MP / Luck). Only rules whose
              capabilities advertise SAN render this COC-flavored block; future
              non-COC rules with their own preset bars will need their own
              renderer here. */}
          {ruleCap.hasSanity && charData.cocDerived && (
            <div className="flex flex-col gap-2">
              {/* HP */}
              <div>
                <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                  <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" /> {tChar("hp")}</span>
                  <span className="font-mono">
                    {charData.cocDerived.hp_current ?? charData.cocDerived.hp}/{charData.cocDerived.hpMax}
                  </span>
                </div>
                <div className="h-2 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      charData.cocDerived.hpMax > 0 &&
                      (charData.cocDerived.hp_current ?? charData.cocDerived.hp) / charData.cocDerived.hpMax > 0.5
                        ? "bg-success"
                        : charData.cocDerived.hpMax > 0 &&
                          (charData.cocDerived.hp_current ?? charData.cocDerived.hp) / charData.cocDerived.hpMax > 0.25
                        ? "bg-accent"
                        : "bg-danger"
                    }`}
                    style={{
                      width: `${
                        charData.cocDerived.hpMax > 0
                          ? Math.min(
                              100,
                              ((charData.cocDerived.hp_current ?? charData.cocDerived.hp) / charData.cocDerived.hpMax) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* SAN */}
              <div>
                <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                  <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> {tChar("san")}</span>
                  <span className="font-mono">
                    {charData.cocDerived.san_current ?? charData.cocDerived.san}/{charData.cocDerived.sanMax}
                  </span>
                </div>
                <div className="h-2 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all duration-300"
                    style={{
                      width: `${
                        charData.cocDerived.sanMax > 0
                          ? Math.min(
                              100,
                              ((charData.cocDerived.san_current ?? charData.cocDerived.san) / charData.cocDerived.sanMax) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* MP */}
              <div>
                <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                  <span className="inline-flex items-center gap-1"><Droplet className="w-3 h-3" /> {tChar("mp")}</span>
                  <span className="font-mono">
                    {charData.cocDerived.mp_current ?? charData.cocDerived.mp}/{charData.cocDerived.mpMax}
                  </span>
                </div>
                <div className="h-2 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all duration-300"
                    style={{
                      width: `${
                        charData.cocDerived.mpMax > 0
                          ? Math.min(
                              100,
                              ((charData.cocDerived.mp_current ?? charData.cocDerived.mp) / charData.cocDerived.mpMax) * 100
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Luck */}
              <div className="flex justify-between text-[10px] text-text-muted border-t border-border/40 pt-1.5 font-medium">
                <span className="inline-flex items-center gap-1"><Clover className="w-3 h-3" /> {tChar("luck")}</span>
                <span className="font-mono font-bold text-text">
                  {charData.cocDerived.luck}
                </span>
              </div>
            </div>
          )}

          {/* 狩魂者 preset status: HP / 灵力值 bars, 术法强度, and the 3 base
              attributes (with their E..SSS+ grades). All maxes/strengths are
              derived from the stored attributes — nothing here is persisted. */}
          {shDerived && shAttrs && (
            <div className="flex flex-col gap-2">
              {/* HP */}
              {(() => {
                const hpCur = charData.shSheet?.hp_current ?? shDerived.hpMax;
                const hpPct = shDerived.hpMax > 0 ? Math.min(100, (hpCur / shDerived.hpMax) * 100) : 0;
                return (
                  <div>
                    <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                      <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" /> {tChar("hp")}</span>
                      <span className="font-mono">{hpCur}/{shDerived.hpMax}</span>
                    </div>
                    <div className="h-2 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          hpPct > 50 ? "bg-success" : hpPct > 25 ? "bg-accent" : "bg-danger"
                        }`}
                        style={{ width: `${hpPct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              {/* 灵力值 */}
              {(() => {
                const manaCur = charData.shSheet?.mana_current ?? shDerived.manaMax;
                const manaPct = shDerived.manaMax > 0 ? Math.min(100, (manaCur / shDerived.manaMax) * 100) : 0;
                return (
                  <div>
                    <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                      <span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> {tChar("shMana")}</span>
                      <span className="font-mono">{manaCur}/{shDerived.manaMax}</span>
                    </div>
                    <div className="h-2 bg-surface-alt rounded-full overflow-hidden border border-border/50">
                      <div className="h-full rounded-full bg-ai transition-all duration-300" style={{ width: `${manaPct}%` }} />
                    </div>
                  </div>
                );
              })()}

              {/* 术法强度 */}
              <div className="flex justify-between text-[10px] text-text-muted border-t border-border/40 pt-1.5 font-medium">
                <span className="inline-flex items-center gap-1"><Wand2 className="w-3 h-3" /> {tChar("shSpellStrength")}</span>
                <span className="font-mono font-bold text-text">{shDerived.spellStrength}</span>
              </div>

              {/* 3 base attributes with grades */}
              <div className="grid grid-cols-3 gap-1.5 border-t border-border/40 pt-1.5">
                {([
                  ["shPhy", shAttrs.phy],
                  ["shWis", shAttrs.wis],
                  ["shSoul", shAttrs.soul],
                ] as const).map(([labelKey, value]) => (
                  <div key={labelKey} className="flex flex-col items-center gap-0.5 rounded bg-surface-alt/60 border border-border/40 py-1">
                    <span className="text-[10px] text-text-muted font-medium truncate max-w-full px-1">{tChar(labelKey)}</span>
                    <span className="font-mono font-bold text-text text-xs">
                      {value} <span className="text-text-dim font-medium">{shGradeLabel(value)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Resource Bars (Basic template or extra attributes) */}
          {charData.customAttributes && charData.customAttributes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {charData.customAttributes.map((attr) => (
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
