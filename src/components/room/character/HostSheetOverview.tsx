"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronRight, IdCard, Minus, Plus } from "lucide-react";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { Notice } from "@/components/shared/Notice";
import { Icons } from "@/components/shared/icons";
import { usePlayerLabel } from "@/components/shared/host-label";
import { editCharacterAction, loadHostSheetsAction, type HostSheetRow } from "@/app/actions/character";
import { getRule } from "@/lib/rules";
import { applySheetEdit, resolveSheet, type ResolvedResource } from "@/lib/character/sheet-model";
import { emptySheet } from "@/lib/character/sheet-v2";
import { getContrastColor, getRandomColorForUser } from "@/lib/ui/avatar-colors";
import { RESOURCE_ICON, DEFAULT_RESOURCE_COLOR } from "./resource-visuals";

/**
 * The host's character overview (UI spec ④): every member (players and bots)
 * with their required-field completion, what's missing, and a stepper per
 * rule resource that saves immediately — rolled back with a notice if the
 * save fails. "打开角色卡" hands over to the sheet panel in host edit mode.
 */
export function HostSheetOverview({ roomId, refreshKey, onClose, onOpenCard }: {
  roomId: number;
  /** Bumped when a sheet changes elsewhere; triggers a quiet reload. */
  refreshKey: number;
  onClose: () => void;
  onOpenCard: (userId: number, nickname: string) => void;
}) {
  const t = useTranslations("character");
  const tCommon = useTranslations("common");
  const playerLabel = usePlayerLabel();
  const [data, setData] = useState<{ ruleId: string; rows: HostSheetRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<"all" | "incomplete">("all");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadHostSheetsAction(roomId)
      .then((d) => { if (alive) { setData(d); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [roomId, refreshKey, attempt]);

  const rule = getRule(data?.ruleId);
  const incomplete = (r: HostSheetRow) => r.completion.requiredSet < r.completion.requiredTotal;
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => filter === "all" || incomplete(r)),
    [data, filter],
  );
  const incompleteCount = (data?.rows ?? []).filter(incomplete).length;
  const columns = `minmax(160px,1.4fr) minmax(120px,1fr) repeat(${rule.sheet.resources.length}, minmax(96px,1fr)) auto`;

  const labelOf = (kind: string, key: string) => {
    const field = kind === "attribute" ? rule.sheet.attributes.find((f) => f.key === key)
      : kind === "resource" ? rule.sheet.resources.find((f) => f.key === key) : undefined;
    return field ? t(field.labelKey) : key;
  };

  // Resource ±1: optimistic, saved at once, rolled back if the save fails.
  const step = async (row: HostSheetRow, res: ResolvedResource, delta: number) => {
    const next = res.current + delta;
    const before = row.sheet;
    const base = before ?? emptySheet(rule.id);
    const edit = { resources: { [res.field.key]: { current: next } } };
    const optimistic = applySheetEdit(rule, base, edit).sheet;
    const patch = (sheet: HostSheetRow["sheet"]) =>
      setData((d) => d && { ...d, rows: d.rows.map((r) => (r.userId === row.userId ? { ...r, sheet } : r)) });
    patch(optimistic);
    setNotice(null);
    const saved = await editCharacterAction(roomId, row.userId, edit)
      .catch(() => ({ success: false as const, error: "" }));
    if (saved.success) { patch(saved.data); return; }
    patch(before);
    setNotice(t("overviewSaveFailed", { name: row.nickname, resource: t(res.field.labelKey), value: res.current }));
  };

  return (
    <OverlayShell onClose={onClose} panelClassName="overlay-modal theme-border w-full max-w-5xl mx-4 max-h-[85vh] flex flex-col bg-surface rounded-theme overflow-hidden">
      {(close) => (
        <>
          <header className="shrink-0 flex items-center gap-3 px-6 py-4 border-b border-border flex-wrap">
            <IdCard className="w-5 h-5 text-primary shrink-0" />
            <h2 className="font-theme-display text-lg font-bold flex-1 min-w-[10rem]">
              {t("overviewTitle")}
              {data && (
                <span className="block sm:inline sm:ml-2 text-[13px] font-medium text-text-muted">
                  <span className="hidden sm:inline">· </span>{t("overviewSummary", { count: data.rows.length, player: playerLabel, incomplete: incompleteCount })}
                </span>
              )}
            </h2>
            <div role="group" aria-label="filter" className="flex gap-1.5">
              {(["all", "incomplete"] as const).map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
                  className={`text-xs leading-7 px-3 rounded-full border transition cursor-pointer ${filter === f
                    ? "text-primary border-primary/50 bg-primary/10" : "text-text-muted border-border hover:text-text"}`}>
                  {f === "all" ? t("overviewFilterAll") : t("overviewFilterIncomplete", { count: incompleteCount })}
                </button>
              ))}
            </div>
            <button type="button" onClick={close} aria-label={tCommon("close")}
              className="p-1 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer">
              <Icons.X className="w-5 h-5" />
            </button>
          </header>

          {notice && (
            <div className="shrink-0 px-6 pt-3">
              <Notice variant="error" onDismiss={() => setNotice(null)} dismissLabel={tCommon("close")}>{notice}</Notice>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {!data && !failed && (
              <div className="p-6 flex flex-col gap-3" aria-busy="true">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-surface-alt" />
                    <span className="w-24 h-3 rounded bg-surface-alt" />
                    <span className="flex-1 h-2 rounded bg-surface-alt" />
                  </div>
                ))}
              </div>
            )}
            {failed && !data && (
              <div className="p-6">
                <div role="alert" className="flex items-center gap-2 px-3 py-2.5 rounded-theme border border-danger/50 bg-danger/8 text-xs">
                  <span className="flex-1 text-danger">{t("overviewLoadFailed")}</span>
                  <button type="button" onClick={() => setAttempt((a) => a + 1)}
                    className="font-semibold px-2.5 py-1 rounded-lg border border-input-border text-text hover:bg-surface-alt cursor-pointer">
                    {t("overviewRetry")}
                  </button>
                </div>
              </div>
            )}
            {data && data.rows.length === 0 && (
              <p className="p-10 text-center text-sm text-text-muted">{t("overviewEmpty", { player: playerLabel })}</p>
            )}

            {data && data.rows.length > 0 && (
              <>
                <div className="hidden sm:grid gap-4 px-6 py-2.5 border-b border-border text-[11px] font-semibold text-text-dim tracking-wide"
                  style={{ gridTemplateColumns: columns }}>
                  <span>{t("overviewMember")}</span>
                  <span>{t("overviewCompletion")}</span>
                  {rule.sheet.resources.map((f) => <span key={f.key}>{t(f.labelKey)}</span>)}
                  <span />
                </div>
                {rows.map((row) => {
                  const resolved = resolveSheet(rule, row.sheet ?? emptySheet(rule.id));
                  const { requiredSet, requiredTotal } = row.completion;
                  const done = requiredSet === requiredTotal;
                  const untouched = requiredTotal > 0 && requiredSet === 0;
                  const color = row.avatarColor || getRandomColorForUser(row.userId);
                  return (
                    <div key={row.userId}
                      className="grid gap-x-4 gap-y-3 px-6 py-3.5 border-b border-border/60 items-center grid-cols-1 sm:[grid-template-columns:var(--cols)]"
                      style={{ "--cols": columns } as React.CSSProperties}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0"
                          style={{ backgroundColor: color, color: getContrastColor(color) }}>
                          {row.isBot ? <Icons.Bot className="w-4 h-4" /> : row.nickname.charAt(0).toUpperCase()}
                        </span>
                        <span className="flex items-center gap-1.5 min-w-0 text-sm font-semibold">
                          <span className="truncate">{row.nickname}</span>
                          {row.isBot && <span className="text-[10px] font-bold text-ai border border-ai/45 rounded-full px-1.5 leading-4 shrink-0">BOT</span>}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5 min-w-0">
                        {requiredTotal > 0 ? (
                          <>
                            <span className="flex items-center gap-1.5">
                              <span className={`font-theme-mono text-sm font-bold ${done ? "text-success" : "text-warning"}`}>{requiredSet} / {requiredTotal}</span>
                              {done && <Check className="w-3.5 h-3.5 text-success" />}
                            </span>
                            <div className="h-1 rounded-full bg-bg overflow-hidden">
                              <div className={`h-full ${done ? "bg-success" : "bg-warning"}`} style={{ width: `${Math.round((requiredSet / requiredTotal) * 100)}%` }} />
                            </div>
                            {!done && (
                              <span className="text-[11px] text-danger truncate" title={row.missing.map((m) => labelOf(m.kind, m.key)).join("、")}>
                                {untouched ? t("overviewNoSheet") : t("overviewMissing", { fields: row.missing.map((m) => labelOf(m.kind, m.key)).join("、") })}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {t("completionSetCount", { count: resolved.attributes.filter((a) => a.isSet).length })}
                          </span>
                        )}
                      </div>

                      {resolved.resources.map((res) => (
                        <OverviewStepper key={res.field.key} resource={res} label={t(res.field.labelKey)}
                          onStep={(d) => step(row, res, d)}
                          decreaseLabel={t("decrease", { name: t(res.field.labelKey) })}
                          increaseLabel={t("increase", { name: t(res.field.labelKey) })} />
                      ))}

                      <button type="button" onClick={() => { onOpenCard(row.userId, row.nickname); close(); }}
                        className="justify-self-start sm:justify-self-end flex items-center gap-1 text-xs font-bold text-primary border border-primary/40 rounded-lg px-2.5 py-1.5 hover:bg-primary/10 whitespace-nowrap cursor-pointer">
                        {untouched ? t("overviewFill") : t("overviewOpen")}<ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <footer className="shrink-0 px-6 py-3 border-t border-border text-xs text-text-dim flex justify-between gap-3 flex-wrap">
            <span>{t("overviewFooter")}</span>
            <span>{t("overviewFooterRule")}</span>
          </footer>
        </>
      )}
    </OverlayShell>
  );
}

const stepCls = "flex items-center justify-center w-6 h-6 rounded-md border border-input-border bg-surface-alt text-text-muted hover:text-primary transition cursor-pointer disabled:opacity-40 disabled:cursor-default shrink-0";

function ratioColor(pct: number): string {
  return pct > 60 ? "var(--theme-success)" : pct > 30 ? "var(--theme-warning)" : "var(--theme-danger)";
}

function OverviewStepper({ resource, label, onStep, decreaseLabel, increaseLabel }: {
  resource: ResolvedResource;
  label: string;
  onStep: (delta: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const { current, max, min, field } = resource;
  const visual = RESOURCE_ICON[field.key];
  const pct = max && max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const color = visual?.ratioTone ? ratioColor(pct) : visual?.color ?? DEFAULT_RESOURCE_COLOR;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="sm:hidden text-[11px] text-text-dim">{label}</span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={stepCls} disabled={current <= min} onClick={() => onStep(-1)} aria-label={decreaseLabel}>
          <Minus className="w-3 h-3" />
        </button>
        <span className="flex-1 text-center font-theme-mono text-sm font-bold whitespace-nowrap">
          {current}{max !== undefined && <span className="text-text-dim"> / {max}</span>}
        </span>
        <button type="button" className={stepCls} disabled={max !== undefined && current >= max} onClick={() => onStep(1)} aria-label={increaseLabel}>
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {field.style === "bar" && (
        <div className="h-1 rounded-full bg-bg overflow-hidden">
          <div className="h-full" style={{ width: `${pct}%`, backgroundColor: `rgb(${color})` }} />
        </div>
      )}
    </div>
  );
}
