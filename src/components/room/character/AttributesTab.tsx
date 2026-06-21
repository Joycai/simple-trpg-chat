"use client";

import { useTranslations } from "next-intl";
import type { CocAttributes, computeCocDerived } from "@/lib/character-types";
import { SaveButton, type SaveStatus } from "./SaveButton";

type CocDerived = ReturnType<typeof computeCocDerived>;

interface AttributesTabProps {
  ruleTemplate: string;
  readOnly: boolean;
  canEditResources: boolean;
  isGM: boolean;
  derived: CocDerived;
  currentHp: number;
  onCurrentHpChange: (v: number) => void;
  currentSan: number;
  onCurrentSanChange: (v: number) => void;
  currentMp: number;
  onCurrentMpChange: (v: number) => void;
  cocAttrs: CocAttributes;
  onUpdateAttr: (key: keyof CocAttributes, value: number) => void;
  saveStatus: SaveStatus;
  onSaveCharacterData: () => void;
  onSaveResources: () => void;
  customAttrs: { name: string; value: number; max?: number }[];
  onRemoveCustomAttr: (name: string) => void;
  newAttrName: string;
  onNewAttrNameChange: (v: string) => void;
  newAttrValue: number;
  onNewAttrValueChange: (v: number) => void;
  onAddCustomAttr: () => void;
}

export function AttributesTab({
  ruleTemplate, readOnly, canEditResources, isGM, derived,
  currentHp, onCurrentHpChange, currentSan, onCurrentSanChange, currentMp, onCurrentMpChange,
  cocAttrs, onUpdateAttr, saveStatus, onSaveCharacterData, onSaveResources,
  customAttrs, onRemoveCustomAttr, newAttrName, onNewAttrNameChange,
  newAttrValue, onNewAttrValueChange, onAddCustomAttr,
}: AttributesTabProps) {
  const t = useTranslations("character");

  // Map keys to the translation keys
  const cocAttrKeys: { key: keyof CocAttributes; tKey: string }[] = [
    { key: "str", tKey: "str" },
    { key: "con", tKey: "con" },
    { key: "siz", tKey: "siz" },
    { key: "dex", tKey: "dex" },
    { key: "app", tKey: "app" },
    { key: "int", tKey: "int" },
    { key: "pow", tKey: "pow" },
    { key: "edu", tKey: "edu" },
    { key: "luck", tKey: "luckAttr" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Resource Bars */}
      <div>
        <label className="text-xs text-text-dim font-medium mb-2 block">{t("resourceStatus")}</label>
        <div className="flex flex-col gap-2">
          {/* HP */}
          <div>
            <div className="flex justify-between text-xs text-text-muted mb-1">
              <span>❤️ {t("hp")}</span>
              {canEditResources ? (
                <div className="flex gap-1 items-center">
                  <input type="number" min={0} max={derived.hpMax}
                    value={currentHp} onChange={e => onCurrentHpChange(Math.max(0, Math.min(parseInt(e.target.value) || 0, derived.hpMax)))}
                    className="w-12 p-0.5 border border-input-border bg-input-bg rounded text-[11px] text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                  <span className="font-mono text-[11px] w-8">{currentHp}/{derived.hpMax}</span>
                </div>
              ) : (
                <span className="font-mono">{currentHp}/{derived.hpMax}</span>
              )}
            </div>
            <div className={`h-3 bg-surface-alt rounded-full overflow-hidden border border-border ${derived.hpMax > 0 && currentHp / derived.hpMax <= 0.25 ? "hp-critical" : ""}`}>
              <div className={`h-full rounded-full transition-all duration-300 hp-bar-fill ${
                derived.hpMax > 0 && currentHp / derived.hpMax > 0.5 ? "bg-success" :
                derived.hpMax > 0 && currentHp / derived.hpMax > 0.25 ? "bg-accent" : "bg-danger"
              }`} style={{ width: `${derived.hpMax > 0 ? Math.min(100, (currentHp / derived.hpMax) * 100) : 0}%` }} />
            </div>
          </div>

          {/* COC-only: SAN / MP / LUCK / Attributes / Derived */}
          {ruleTemplate === "coc7th" && (
          <div>
            {/* SAN */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-text-muted mb-1">
                <span>💜 {t("san")}</span>
                {canEditResources ? (
                  <div className="flex gap-1 items-center">
                    <input type="number" min={0} max={derived.sanMax}
                      value={currentSan} onChange={e => onCurrentSanChange(Math.max(0, Math.min(parseInt(e.target.value) || 0, derived.sanMax)))}
                      className="w-12 p-0.5 border border-input-border bg-input-bg rounded text-[11px] text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                    <span className="font-mono text-[11px] w-8">{currentSan}/{derived.sanMax}</span>
                  </div>
                ) : (
                  <span className="font-mono">{currentSan}/{derived.sanMax}</span>
                )}
              </div>
              <div className="h-3 bg-surface-alt rounded-full overflow-hidden border border-border">
                <div className="h-full rounded-full transition-all duration-300 bg-purple-500"
                  style={{ width: `${derived.sanMax > 0 ? Math.min(100, (currentSan / derived.sanMax) * 100) : 0}%` }} />
              </div>
            </div>

            {/* MP */}
            <div className="mb-2">
              <div className="flex justify-between text-xs text-text-muted mb-1">
                <span>💙 {t("mp")}</span>
                {canEditResources ? (
                  <div className="flex gap-1 items-center">
                    <input type="number" min={0} max={derived.mpMax}
                      value={currentMp} onChange={e => onCurrentMpChange(Math.max(0, Math.min(parseInt(e.target.value) || 0, derived.mpMax)))}
                      className="w-12 p-0.5 border border-input-border bg-input-bg rounded text-[11px] text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
                    <span className="font-mono text-[11px] w-8">{currentMp}/{derived.mpMax}</span>
                  </div>
                ) : (
                  <span className="font-mono">{currentMp}/{derived.mpMax}</span>
                )}
              </div>
              <div className="h-3 bg-surface-alt rounded-full overflow-hidden border border-border">
                <div className="h-full rounded-full transition-all duration-300 bg-blue-500"
                  style={{ width: `${derived.mpMax > 0 ? Math.min(100, (currentMp / derived.mpMax) * 100) : 0}%` }} />
              </div>
            </div>

            {/* LUCK */}
            <div className="flex justify-between text-xs text-text-muted">
              <span>🍀 {t("luck")}</span>
              <span className="font-mono">{derived.luck}</span>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* COC Attributes */}
      {ruleTemplate === "coc7th" && (
      <div>
        <label className="text-xs text-text-dim font-medium mb-2 block">{t("baseAttributes")}</label>
        <div className="grid grid-cols-2 gap-2">
          {cocAttrKeys.map(({ key, tKey }) => (
            <div key={key} className="flex items-center gap-2 bg-surface-alt rounded p-2">
              <label className="text-xs text-text-muted w-16 shrink-0">{t(tKey).split(" ")[0]}</label>
              <input type="number" min={0} max={99}
                value={cocAttrs[key]} onChange={e => onUpdateAttr(key, parseInt(e.target.value) || 0)}
                disabled={readOnly}
                className="w-14 p-1 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary disabled:opacity-85 disabled:cursor-default" />
              <span className="text-[10px] text-text-dim w-8 text-right">{Math.floor((cocAttrs[key] - 50) / 5)}</span>
            </div>
          ))}
        </div>
      </div>
      )}

      {/* Derived */}
      {ruleTemplate === "coc7th" && (
      <div>
        <label className="text-xs text-text-dim font-medium mb-2 block">{t("derivedAttributes")}</label>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-surface-alt rounded p-2 text-center">
            <span className="text-text-muted">MOV</span>
            <div className="font-bold text-text font-mono">{derived.mov}</div>
          </div>
          <div className="bg-surface-alt rounded p-2 text-center">
            <span className="text-text-muted">DB</span>
            <div className="font-bold text-text font-mono">{derived.db}</div>
          </div>
          <div className="bg-surface-alt rounded p-2 text-center">
            <span className="text-text-muted">{t("build")}</span>
            <div className="font-bold text-text font-mono">{derived.build}</div>
          </div>
        </div>
      </div>
      )}

      {ruleTemplate !== "coc7th" && (
        <p className="text-xs text-text-dim text-center py-2">
          {t("generalD100Hint")}
        </p>
      )}

      {!readOnly && (
        <div className="flex gap-2">
          <SaveButton status={saveStatus} onClick={onSaveCharacterData} idleLabel={t("saveAttributes")} className="flex-1" />
          {ruleTemplate === "coc7th" && (
            <SaveButton status={saveStatus} onClick={onSaveResources} idleLabel={t("saveResources") || "保存资源"} className="flex-1" />
          )}
        </div>
      )}
      {canEditResources && readOnly && isGM && ruleTemplate === "coc7th" && (
        <SaveButton status={saveStatus} onClick={onSaveResources} idleLabel={t("saveResources") || "保存资源"} className="w-full" />
      )}

      {/* Custom Attributes */}
      <div>
        <label className="text-xs text-text-dim font-medium mb-2 block">{t("customAttributes")}</label>
        {customAttrs.length > 0 && (
          <div className="flex flex-col gap-1 mb-2">
            {customAttrs.map(attr => (
              <div key={attr.name} className="flex items-center gap-2 bg-surface-alt rounded p-2 group">
                <span className="flex-1 text-sm text-text">{attr.name}</span>
                <span className="text-xs text-text-muted font-mono w-12 text-right">{attr.value}</span>
                {!readOnly && (
                  <button onClick={() => onRemoveCustomAttr(attr.name)}
                    className="text-xs text-text-dim hover:text-danger opacity-0 group-hover:opacity-100 transition cursor-pointer">🗑</button>
                )}
              </div>
            ))}
          </div>
        )}
        {!readOnly && (
          <div className="flex gap-2">
            <input value={newAttrName} onChange={e => onNewAttrNameChange(e.target.value)}
              placeholder={t("customAttrPlaceholder")} onKeyDown={e => e.key === "Enter" && onAddCustomAttr()}
              className="flex-1 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text outline-none focus:ring-1 focus:ring-primary" />
            <input type="number" min={0} max={999} value={newAttrValue}
              onChange={e => onNewAttrValueChange(parseInt(e.target.value) || 0)}
              className="w-16 p-1.5 border border-input-border bg-input-bg rounded text-sm text-text text-center font-mono outline-none focus:ring-1 focus:ring-primary" />
            <button onClick={onAddCustomAttr}
              className="bg-primary hover:bg-primary-hover text-white px-3 py-1.5 rounded text-xs font-bold cursor-pointer">＋</button>
          </div>
        )}
      </div>
    </div>
  );
}
