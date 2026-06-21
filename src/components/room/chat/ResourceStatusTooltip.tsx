import { createPortal } from "react-dom";
import { type CharacterData } from "@/lib/character-types";
import { useTranslations } from "next-intl";

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

  const ruleTemplate = charData?.ruleTemplate || "basic";

  // Check if character has set resource status
  const hasStatus = !loading && !!charData && (
    (charData.ruleTemplate === "coc7th" && !!charData.cocDerived) ||
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
          <span className="text-lg">🎴</span>
          <span className="font-medium">{tChat("resourceUnavailable")}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Character Name / Nickname */}
          <div className="font-bold border-b border-border/60 pb-1 text-text truncate max-w-full">
            {nickname}
          </div>

          {/* COC 7th Specific Resources */}
          {ruleTemplate === "coc7th" && charData.cocDerived && (
            <div className="flex flex-col gap-2">
              {/* HP */}
              <div>
                <div className="flex justify-between text-[10px] text-text-muted mb-0.5 font-medium">
                  <span>❤️ {tChar("hp")}</span>
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
                  <span>💜 {tChar("san")}</span>
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
                  <span>💙 {tChar("mp")}</span>
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
                <span>🍀 {tChar("luck")}</span>
                <span className="font-mono font-bold text-text">
                  {charData.cocDerived.luck}
                </span>
              </div>
            </div>
          )}

          {/* Custom Resource Bars (Basic template or extra attributes) */}
          {charData.customAttributes && charData.customAttributes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {charData.customAttributes.map((attr) => (
                <div key={attr.name} className="flex flex-col gap-0.5">
                  <div className="flex justify-between text-[10px] text-text-muted font-medium">
                    <span>✨ {attr.name}</span>
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
