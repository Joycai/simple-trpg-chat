"use client";

import { useState, useEffect, useRef, useSyncExternalStore, memo, Fragment } from "react";
import { formatTime } from "@/lib/utils";
import { ImagePreview } from "@/components/shared/ImagePreview";
import { useTranslations } from "next-intl";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Icons } from "@/components/shared/icons";
import { ResourceStatusTooltip } from "@/components/room/chat/ResourceStatusTooltip";
import { getCharacterDataAction } from "@/app/actions/character";
import { type CharacterData } from "@/lib/character-types";
import { getContrastColor, getRandomColorForUser } from "@/lib/avatar-colors";
import type { Audience } from "@/lib/messaging/audience";

// Stable `useSyncExternalStore` callbacks. The store never changes, so subscribe
// is a no-op; the snapshot pair gives us a "true on client / false on server"
// mount flag without a `useEffect`.
const subscribeNoop = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

/**
 * Split a content string into a leading emoji (incl. optional VS16 variation
 * selector) and the rest. Used to give themes a hideable wrapper around the
 * 🎯/🩸/📋/📤/✅ glyphs that pepper system + check_request messages — shrine
 * hides them so the layout reads cleanly without UTF-8 emoji breaking the
 * mincho aesthetic.
 */
function stripLeadingEmoji(content: string): { emoji: string; rest: string } {
  const m = content.match(/^(\p{Extended_Pictographic}(?:\u{FE0F})?)\s*([\s\S]*)/u);
  if (!m) return { emoji: "", rest: content };
  return { emoji: m[1] ?? "", rest: m[2] ?? content };
}

/** Minimal inline renderer that only understands `**bold**` for system titles. */
function SystemTitleRenderer({ text }: { text: string }) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

/**
 * System pill content. Single-line messages render inline next to the optional
 * emoji. Multi-line messages (currently only `.help`) split the first line off
 * as a title and route the remainder through MarkdownRenderer.
 */
function SystemPillContent({ content, block }: { content: string; block: boolean }) {
  const { emoji, rest } = stripLeadingEmoji(content);
  const emojiSpan = emoji ? (
    <span className="system-pill-emoji" aria-hidden>{emoji}{" "}</span>
  ) : null;

  if (!block) {
    return (
      <>
        {emojiSpan}
        <span className="system-pill-text">{rest}</span>
      </>
    );
  }

  const lines = rest.split("\n");
  const title = lines[0] ?? "";
  const bodyText = lines.slice(1).join("\n");

  return (
    <>
      <div className="system-pill-title">
        {emojiSpan}
        <SystemTitleRenderer text={title} />
      </div>
      {bodyText && (
        <div className="system-pill-body-text">
          <MarkdownRenderer content={bodyText} />
        </div>
      )}
    </>
  );
}

/**
 * Theme-overridable dice metadata extracted from `diceDetail`.
 * Surfaces `kind` (roll/check/sanity), `grade` (success/failure/critical/fumble),
 * and an `insanity` flag onto `data-*` attributes so themes can style each
 * variant without re-parsing the JSON.
 */
type DiceKind = "roll" | "check" | "sanity";
type DiceGrade = "none" | "success" | "failure" | "critical" | "fumble";
function parseDiceMeta(diceDetail: string | null | undefined): {
  kind: DiceKind;
  grade: DiceGrade;
  insanity: boolean;
  /** Psychology hidden roll marker — host's view of a `.psy` audience=self check. */
  psy: boolean;
} {
  if (!diceDetail) return { kind: "roll", grade: "none", insanity: false, psy: false };
  try {
    const d = JSON.parse(diceDetail) as {
      check?: { grade?: DiceGrade; success?: boolean };
      sanityCheck?: { deduction?: number };
      psy?: unknown;
    };
    const psy = !!d.psy;
    if (d.sanityCheck) {
      const grade: DiceGrade =
        d.check?.grade ?? (d.check?.success ? "success" : "failure");
      return { kind: "sanity", grade, insanity: (d.sanityCheck.deduction ?? 0) >= 5, psy };
    }
    if (d.check) {
      const grade: DiceGrade =
        d.check.grade ?? (d.check.success ? "success" : "failure");
      return { kind: "check", grade, insanity: false, psy };
    }
    return { kind: "roll", grade: "none", insanity: false, psy };
  } catch {
    return { kind: "roll", grade: "none", insanity: false, psy: false };
  }
}

type DiceDetailJson = {
  notation?: string;
  dice?: string;
  sum?: number;
  results?: number[];
  command?: string;
  check?: { skillName: string; target: number; success: boolean; grade?: DiceGrade };
  sanityCheck?: {
    oldSanity: number;
    newSanity: number;
    deductExpression: string;
    deduction: number;
    isSuccess: boolean;
  };
};

/** Roll category drives which icon sits in the bubble's leading slot. */
type RollKind = "plain" | "check" | "sanity";
function getRollKind(d: DiceDetailJson): RollKind {
  if (d.sanityCheck) return "sanity";
  if (d.check) return "check";
  return "plain";
}

/** d100 single-die check results pad to two digits per the design (`03` not `3`). */
function padD100(value: number | undefined): string {
  if (value == null) return "";
  return value < 10 ? `0${value}` : String(value);
}

/** Strip the leading "1" off "1d100" → "d100" for visual cleanliness in checks. */
function trimSingleDieNotation(raw: string | undefined): string {
  if (!raw) return "";
  return raw.startsWith("1d") ? raw.slice(1) : raw;
}

/** Leading icon for the dice bubble, chosen by roll kind, grade, and the psy flag. */
function RollIcon({ kind, grade, psy }: { kind: RollKind; grade: DiceGrade; psy?: boolean }) {
  if (grade === "critical") return <Icons.Check className="w-4 h-4" />;
  if (grade === "fumble") return <Icons.X className="w-4 h-4" />;
  if (psy) return <Icons.Eye className="w-4 h-4" />;
  if (kind === "sanity") return <Icons.Droplet className="w-4 h-4" />;
  if (kind === "check") return <Icons.Target className="w-4 h-4" />;
  return <Icons.Dices className="w-4 h-4" />;
}

/**
 * Translatable success/failure/critical/fumble label rendered as
 * `<span class="dice-result-grade"><span class="dice-result-grade-icon">✅ </span><span class="dice-result-grade-label">成功</span></span>`.
 * The icon span carries its trailing space, so hiding it cleanly removes the
 * gap for themes (e.g. shrine) that swap the emoji for a colored chip.
 */
function DiceResultGrade({
  grade,
  t,
}: {
  grade: Exclude<DiceGrade, "none">;
  t: (key: string, opts?: Record<string, string | number | Date>) => string;
}) {
  const icon =
    grade === "critical" ? "🟢"
    : grade === "fumble" ? "🔴"
    : grade === "success" ? "✅"
    : "❌";
  return (
    <span className="dice-result-grade" data-grade={grade}>
      <span className="dice-result-grade-icon" aria-hidden>{icon}{" "}</span>
      <span className="dice-result-grade-label">{t(grade)}</span>
    </span>
  );
}

/**
 * Structured renderer for `diceDetail`. Parallels `formatDiceResult` but emits
 * DOM hooks (`.dice-result-skill`, `.dice-result-grade`, `.dice-result-insanity`)
 * so themes can style the skill name / grade chip / insanity warning without
 * regex-parsing the rendered text. Non-shrine themes see the emoji + plain text
 * unchanged because the hooks have no default styling.
 */
function DiceResultDisplay({
  diceDetail,
  fallback,
  t,
}: {
  diceDetail: string | null | undefined;
  fallback: string;
  t: (key: string, opts?: Record<string, string | number | Date>) => string;
}) {
  if (!diceDetail) return <span className="dice-formula">{fallback}</span>;
  let d: DiceDetailJson;
  try {
    d = JSON.parse(diceDetail);
  } catch {
    return <span className="dice-formula">{diceDetail}</span>;
  }

  // .sc — sanity check renders a card layout with its own header / body /
  // attached insanity warning. Bubble outer padding is suppressed by shrine.
  if (d.sanityCheck) {
    const { oldSanity, newSanity, deductExpression, deduction, isSuccess } = d.sanityCheck;
    const grade: Exclude<DiceGrade, "none"> = isSuccess ? "success" : "failure";
    const sanityLabel = t("scSanityLabel") || "理智";
    const deductLabel = t("scDeductLabel") || "扣除";
    const insanityLabel = t("scWarningInsanityShort") || "临时疯狂";
    const insanity = deduction >= 5;
    return (
      <div className="sc-card bg-dice-card-bg border border-dice-card-border rounded-theme overflow-hidden min-w-[280px]">
        <div className="sc-card-header flex items-center gap-2.5 px-3 py-2 border-b border-border">
          <span className="dice-icon inline-flex items-center justify-center w-7 h-7 rounded-theme bg-danger/10 text-danger border border-danger/30 shrink-0">
            <Icons.Droplet className="w-4 h-4" />
          </span>
          <span className="dice-skill sc-card-title flex-1 font-semibold text-sm">{sanityLabel}检定</span>
          <span className="sc-card-summary inline-flex items-baseline gap-1 font-theme-mono">
            <span className="dice-formula text-text-dim text-xs">d100 = </span>
            <span className="dice-value text-base font-semibold">{padD100(d.sum)}</span>
            <span className="dice-target text-text-dim text-xs"> / {oldSanity}</span>
          </span>
          <DiceResultGrade grade={grade} t={t} />
        </div>
        <dl className="sc-card-body grid grid-cols-[minmax(56px,auto)_1fr] gap-x-4 gap-y-1 px-3 py-2 text-xs m-0">
          <div className="sc-card-row contents">
            <dt className="text-text-muted">{deductLabel}</dt>
            <dd className="font-theme-mono text-text m-0">{deductExpression} = {deduction} 点</dd>
          </div>
          <div className="sc-card-row contents">
            <dt className="text-text-muted">{sanityLabel}值</dt>
            <dd className="font-theme-mono text-text m-0">{oldSanity} → {newSanity}</dd>
          </div>
        </dl>
        {insanity && (
          <div className="sc-warning flex items-center gap-2 mx-2 mb-2 px-3 py-1.5 rounded-theme bg-danger/10 border border-danger/40 text-danger text-xs" role="alert">
            <Icons.AlertTriangle className="w-4 h-4" />
            <span>一次性扣除 ≥ 5 点 · {insanityLabel}</span>
          </div>
        )}
      </div>
    );
  }

  const rawNotation = d.notation || d.dice || "";
  const showResults = Array.isArray(d.results) && d.results.length > 1;
  const isD100Check = !!d.check;

  if (d.check) {
    const { skillName, target, success, grade } = d.check;
    const finalGrade: Exclude<DiceGrade, "none"> =
      grade && grade !== "none" ? grade : success ? "success" : "failure";
    return (
      <>
        <span className="dice-skill">{skillName}</span>
        <span className="dice-formula">{trimSingleDieNotation(rawNotation)} = </span>
        <span className="dice-value">{padD100(d.sum)}</span>
        <span className="dice-target"> / {target}</span>
        <DiceResultGrade grade={finalGrade} t={t} />
      </>
    );
  }

  return (
    <>
      <span className="dice-formula">
        {rawNotation}
        {showResults && ` [${d.results!.join(", ")}]`}
        {" = "}
      </span>
      <span className="dice-value">{isD100Check ? padD100(d.sum) : d.sum}</span>
    </>
  );
}

/**
 * Wrap each `【skill】` substring in a `<span class="check-request-skill">`
 * so themes can give the skill name its own accent (e.g. shrine paints it gold)
 * without altering the surrounding sentence.
 */
function renderCheckRequestContent(content: string, highlight?: string | null): React.ReactNode {
  const { emoji, rest } = stripLeadingEmoji(content);
  // Legacy 【…】 wrap (kept for messages predating the bracket-free i18n).
  const bracketRe = /【([^】]+)】/g;
  if (bracketRe.test(rest)) {
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;
    bracketRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = bracketRe.exec(rest)) !== null) {
      if (m.index > lastIdx) parts.push(rest.slice(lastIdx, m.index));
      parts.push("【");
      parts.push(<span key={m.index} className="check-request-skill">{m[1]}</span>);
      parts.push("】");
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < rest.length) parts.push(rest.slice(lastIdx));
    return (
      <>
        {emoji && <span className="check-request-emoji" aria-hidden>{emoji}{" "}</span>}
        {parts}
      </>
    );
  }
  // Modern path — wrap the supplied `highlight` substring (skillName / sanity label).
  if (highlight) {
    const idx = rest.indexOf(highlight);
    if (idx !== -1) {
      return (
        <>
          {emoji && <span className="check-request-emoji" aria-hidden>{emoji}{" "}</span>}
          {rest.slice(0, idx)}
          <span className="check-request-skill">{highlight}</span>
          {rest.slice(idx + highlight.length)}
        </>
      );
    }
  }
  return (
    <>
      {emoji && <span className="check-request-emoji" aria-hidden>{emoji}{" "}</span>}
      {rest}
    </>
  );
}

/** Wrap the leading ✅ of the check-progress label so themes can hide it. */
function renderCheckProgress(text: string): React.ReactNode {
  const { emoji, rest } = stripLeadingEmoji(text);
  return (
    <>
      {emoji && <span className="check-request-progress-emoji" aria-hidden>{emoji}{" "}</span>}
      {rest}
    </>
  );
}

/** Three-row metadata for system pills, keyed by `systemKind`. */
const SYSTEM_PILL_META: Record<"st" | "error" | "room-event" | "scene-marker", {
  icon: typeof Icons.CheckSquare;
  className: string;
}> = {
  "st":            { icon: Icons.CheckSquare,    className: "system-pill-body--ok" },
  "error":         { icon: Icons.AlertTriangle,  className: "system-pill-body--err" },
  "room-event":    { icon: Icons.UserPlus,       className: "system-pill-body--info" },
  "scene-marker":  { icon: Icons.Clock,          className: "system-pill-body--info" },
};

/** Help card: structured 2-column command reference. Reads `helpEntries` via t.raw. */
function HelpCard({ visSelfLabel }: { visSelfLabel: string }) {
  const t = useTranslations("commands");
  let title = "Command Help";
  try { title = t("helpTitle"); } catch { /* fallback */ }
  let entries: Array<{ cmd: string; desc: string }> = [];
  try {
    const raw = (t as unknown as { raw: (k: string) => unknown }).raw("helpEntries");
    if (Array.isArray(raw)) {
      entries = raw.filter((e): e is { cmd: string; desc: string } =>
        !!e && typeof (e as { cmd?: unknown }).cmd === "string" && typeof (e as { desc?: unknown }).desc === "string"
      );
    }
  } catch { /* missing — leave entries empty */ }

  return (
    <div className="help-card bg-surface-alt border border-border rounded-theme px-4 py-3 max-w-2xl text-left">
      <div className="help-card-header flex items-center gap-2 pb-1.5 mb-2 border-b border-border">
        <Icons.HelpCircle className="w-4 h-4 help-card-icon text-primary" />
        <span className="help-card-title flex-1 text-sm font-semibold">{title}</span>
        <span className="help-card-self inline-flex items-center gap-1 text-[11px] text-text-dim">
          <Icons.Lock className="w-3 h-3" /> {visSelfLabel}
        </span>
      </div>
      {entries.length > 0 && (
        <dl className="help-card-list grid grid-cols-[minmax(140px,max-content)_1fr] gap-x-4 gap-y-1 text-xs m-0">
          {entries.map((e, i) => (
            <div key={i} className="help-card-row contents">
              <dt className="font-theme-mono text-text">{e.cmd}</dt>
              <dd className="text-text-muted m-0">{e.desc}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// LRU-capped cache (max 200 entries) for character resource data, keyed by `${roomId}-${senderId}`
const CHAR_CACHE_MAX = 200;
const characterCache = new Map<
  string,
  {
    data: CharacterData | null;
    promise?: Promise<CharacterData | null>;
  }
>();

function setCacheEntry(key: string, value: { data: CharacterData | null; promise?: Promise<CharacterData | null> }) {
  if (!characterCache.has(key) && characterCache.size >= CHAR_CACHE_MAX) {
    // Evict oldest entry
    const oldest = characterCache.keys().next().value;
    if (oldest !== undefined) characterCache.delete(oldest);
  }
  characterCache.set(key, value);
}

interface ChatMessageProps {
  nickname: string;
  content: string;
  type: "text" | "dice" | "system" | "check_request" | "image" | "clue";
  /** Subtype for type='system' messages. Drives the kind-specific pill / help card render. */
  systemKind?: "st" | "error" | "room-event" | "scene-marker" | "help" | null;
  diceDetail?: string | null;
  isPrivate: boolean;
  audience?: Audience;
  createdAt: string;
  isOwn: boolean;
  isBot?: boolean;
  userId?: number;
  senderId?: number;
  isHost?: boolean;
  onViewCharacter?: (userId: number, nickname: string) => void;
  onStartDM?: (userId: number) => void;
  onCheckRequest?: (messageId: number, skillName: string, diceType: string) => void;
  messageId?: number;
  roomId?: number;
  hostId?: number;
  avatarColor?: string | null;
  avatar?: string | null;
}

export const ChatMessage = memo(function ChatMessage({
  nickname,
  content,
  type,
  systemKind,
  diceDetail,
  isPrivate,
  audience,
  createdAt,
  isOwn,
  isBot = false,
  userId,
  senderId,
  isHost = false,
  onViewCharacter,
  onStartDM,
  onCheckRequest,
  messageId,
  roomId,
  hostId,
  avatarColor,
  avatar,
}: ChatMessageProps) {
  const t = useTranslations("chat");
  const tRoom = useTranslations("room");
  // `formatTime` reads `new Date()` and diverges between SSR and client.
  // useSyncExternalStore returns the server snapshot (false) during SSR and the
  // client snapshot (true) thereafter, avoiding the setState-in-effect pattern.
  const mounted = useSyncExternalStore(subscribeNoop, getClientTrue, getServerFalse);
  const [showMenu, setShowMenu] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [charData, setCharData] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [imgError, setImgError] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleOutsideClick = () => setShowMenu(false);
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, [showMenu]);

  const canView = !!(roomId && hostId && senderId && !isOwn && (
    senderId !== hostId && (isHost ? true : !isBot)
  ));

  useEffect(() => {
    if (!isHovered || !canView) return;

    const updatePosition = () => {
      if (avatarRef.current) {
        const rect = avatarRef.current.getBoundingClientRect();
        setCoords({
          top: rect.top,
          left: rect.right + 8,
        });
      }
    };

    updatePosition();

    // Find nearest scrollable container
    const scrollParent = avatarRef.current?.closest(".overflow-y-auto");
    if (scrollParent) {
      scrollParent.addEventListener("scroll", updatePosition);
    }
    window.addEventListener("resize", updatePosition);

    return () => {
      if (scrollParent) {
        scrollParent.removeEventListener("scroll", updatePosition);
      }
      window.removeEventListener("resize", updatePosition);
    };
  }, [isHovered, canView]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (!canView || !roomId || !senderId) return;

    const cacheKey = `${roomId}-${senderId}`;
    const cached = characterCache.get(cacheKey);

    if (cached) {
      if (cached.promise) {
        setLoading(true);
        cached.promise.then((data) => {
          setCharData(data);
          setLoading(false);
        });
      } else {
        setCharData(cached.data);
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    const promise = getCharacterDataAction(roomId, senderId)
      .then((data) => {
        setCacheEntry(cacheKey, { data, promise: undefined });
        return data;
      })
      .catch((err) => {
        console.error("Failed to fetch character data for tooltip:", err);
        characterCache.delete(cacheKey);
        return null;
      });

    setCacheEntry(cacheKey, { data: null, promise });

    promise.then((data) => {
      setCharData(data);
      setLoading(false);
    });
  };

  // Check request rendering
  if (type === "check_request") {
    type CheckInfo = {
      checkRequest?: {
        targetUserIds?: number[];
        skillName?: string;
        diceType?: string;
        respondedUserIds?: number[];
        sanCheck?: { successExpr?: string; failureExpr?: string };
        ghost?: boolean;
      };
    };
    let checkInfo: CheckInfo | null = null;
    try { checkInfo = diceDetail ? JSON.parse(diceDetail) as CheckInfo : null; } catch {}
    const cr = checkInfo?.checkRequest;
    const targetIds = cr?.targetUserIds ?? [];
    const respondedIds = cr?.respondedUserIds ?? [];
    const isTarget = userId !== undefined && targetIds.includes(userId);
    const alreadyResponded = userId !== undefined && respondedIds.includes(userId);
    const totalCount = targetIds.length;
    const doneCount = respondedIds.length;
    const checkState: "target-pending" | "target-done" | "viewer" = isTarget
      ? alreadyResponded ? "target-done" : "target-pending"
      : "viewer";
    const allDone = totalCount > 0 && doneCount >= totalCount;
    // Derive request category for theming. sanity = carries sanCheck or 理智值
    // as skillName; ghost = explicit gm-private announcement; otherwise plain skill.
    const isSanity = !!cr?.sanCheck || cr?.skillName === "理智值";
    const isGhost = !!cr?.ghost;
    const checkKind: "skill" | "sanity" | "gm-private" = isGhost ? "gm-private" : isSanity ? "sanity" : "skill";
    const highlightToken =
      checkKind === "sanity" ? t("sanityCheckLabel")
      // skill + gm-private both pull the skill label straight from the request
      // (e.g. ".rc 心理学" → highlights "心理学").
      : (cr?.skillName ?? null);
    const KindIcon =
      checkKind === "sanity" ? Icons.Droplet
      : checkKind === "gm-private" ? Icons.Eye
      : Icons.Target;
    const sanInline = checkKind === "sanity" && cr?.sanCheck
      ? t("scExprInline", {
          successExpr: cr.sanCheck.successExpr ?? "0",
          failureExpr: cr.sanCheck.failureExpr ?? "0",
        })
      : null;

    return (
      <div
        className="check-request flex justify-center py-2 animate-in fade-in"
        data-state={checkState}
        data-check-kind={checkKind}
        data-complete={allDone ? "true" : undefined}
      >
        <div className={`check-request-body flex items-center gap-2 px-4 py-2 rounded-full ${
          checkState === "target-pending" ? "bg-accent/10 border border-accent/30" : "bg-surface-alt"
        }`}>
          <KindIcon className="check-request-kind-icon w-4 h-4 text-accent shrink-0" />
          <span className="check-request-text text-sm text-text">
            {renderCheckRequestContent(content, highlightToken)}
            {sanInline && <span className="check-request-sc-expr">{sanInline}</span>}
          </span>
          {totalCount > 0 && (
            <span className="check-request-progress text-xs text-text-muted whitespace-nowrap inline-flex items-center gap-1">
              {checkState === "target-done" || allDone ? (
                <Icons.Check className="check-request-progress-icon w-3 h-3 text-success" aria-hidden />
              ) : null}
              {renderCheckProgress(t("checkProgress", { done: doneCount, total: totalCount }))}
            </span>
          )}
          {checkKind === "gm-private" ? (
            <span className="check-request-ghost-badge inline-flex items-center gap-1 text-[11px] text-text-dim border border-border rounded-full px-2 py-0.5">
              <Icons.Lock className="w-3 h-3" />
              {t("ghostRollBadge")}
            </span>
          ) : checkState === "target-pending" && onCheckRequest && messageId !== undefined ? (
            <button
              onClick={() => onCheckRequest(messageId, cr?.skillName ?? "", cr?.diceType ?? "")}
              className="check-request-button bg-accent hover:bg-accent-hover text-accent-foreground w-8 h-8 rounded-full flex items-center justify-center transition animate-bounce shadow-[var(--theme-glow)]"
              title={t("clickCheck")}
            >
              <Icons.Dices className="w-4 h-4" />
            </button>
          ) : checkState === "target-done" ? (
            <Icons.Check className="check-request-done w-4 h-4 text-success" aria-label={t("checkDone")} />
          ) : (
            <Icons.Dices className="check-request-icon w-4 h-4 text-accent shrink-0" aria-hidden />
          )}
        </div>
      </div>
    );
  }

  if (type === "system") {
    // Help renders as a structured 2-column card, not a pill.
    if (systemKind === "help") {
      return (
        <div className="system-pill flex justify-center py-2 animate-in fade-in" data-kind="help">
          <HelpCard visSelfLabel={t("visSelf")} />
        </div>
      );
    }
    // Legacy multi-line messages keep the block-card fallback (no system_kind set).
    const isBlock = !systemKind && content.includes("\n");
    if (isBlock) {
      return (
        <div className="system-pill flex justify-center py-2 animate-in fade-in" data-block="true">
          <div className="system-pill-body bg-surface-alt border border-border rounded-theme px-4 py-3 text-sm text-text max-w-lg text-left">
            <SystemPillContent content={content} block />
          </div>
        </div>
      );
    }
    // Kind-tagged pill (st / error / room-event / scene-marker) or the default
    // neutral pill. `help` is already handled above, so by here `systemKind` is
    // either one of the four pill kinds or null/undefined.
    const meta = systemKind ? SYSTEM_PILL_META[systemKind] : null;
    const KindIcon = meta?.icon;
    return (
      <div
        className="system-pill flex justify-center py-2 animate-in fade-in"
        data-kind={systemKind ?? undefined}
      >
        <span
          className={`system-pill-body inline-flex items-center gap-1.5 text-xs italic px-3 py-1 rounded-full ${
            meta
              ? `${meta.className} not-italic`
              : "text-text-dim bg-surface-alt"
          }`}
        >
          {KindIcon && <KindIcon className="w-3.5 h-3.5 system-pill-icon" />}
          <span className="system-pill-text">
            {systemKind === "scene-marker" ? `— ${content} —` : content}
          </span>
        </span>
      </div>
    );
  }

  const isDice = type === "dice";
  const isImage = type === "image";
  const diceMeta = isDice ? parseDiceMeta(diceDetail) : null;
  // Extract command echo + roll kind from diceDetail so they can be lifted out
  // of the bubble: echo into the header line, kind onto a data-attr for theming.
  let diceCommandEcho: string | null = null;
  let diceRollKind: RollKind = "plain";
  if (isDice && diceDetail) {
    try {
      const d = JSON.parse(diceDetail) as DiceDetailJson;
      if (typeof d.command === "string" && d.command.trim()) {
        diceCommandEcho = d.command.trim();
      }
      diceRollKind = getRollKind(d);
    } catch {
      /* malformed diceDetail — skip echo */
    }
  }

  // Visibility badge shown next to the nickname. Driven by the message audience
  // (not the legacy isPrivate flag) so a DM whisper isn't mislabelled as a GM
  // hidden roll. `everyone` shows nothing; system/clue notices render elsewhere.
  const visibilityBadge =
    audience === "self" ? t("visSelf")
    : audience === "dm" ? t("visDm")
    : audience === "directed" ? t("visDirected")
    : audience === "gm" ? t("visGm")
    : null;

  return (
    <div className={`flex gap-3 py-1.5 group animate-in fade-in slide-in-from-bottom-1 ${isOwn ? "flex-row-reverse" : ""}`}>
      {/* Avatar Wrapper */}
      <div
        ref={avatarRef}
        className="relative shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setIsHovered(false)}
      >
        {avatar ? (
          <img
            src={avatar}
            alt={nickname}
            className={`w-8 h-8 rounded-theme flex-shrink-0 transition shadow-sm ${
              isPrivate
                ? "border-2 border-private-border"
                : isOwn
                ? "border border-primary/30"
                : "border border-border"
            }`}
          />
        ) : (
          <div
            className={`w-8 h-8 rounded-theme flex items-center justify-center text-xs font-bold transition shadow-sm ${
              isPrivate
                ? "border-2 border-private-border"
                : isOwn
                ? "border border-primary/30"
                : "border border-border"
            }`}
            style={{
              backgroundColor: avatarColor || getRandomColorForUser(senderId || 0),
              color: getContrastColor(avatarColor || getRandomColorForUser(senderId || 0)),
            }}
          >
            {nickname.charAt(0).toUpperCase()}
          </div>
        )}

        {isHovered && canView && (
          <ResourceStatusTooltip
            loading={loading}
            charData={charData}
            nickname={nickname}
            coords={coords}
          />
        )}
      </div>

      {/* Bubble */}
      <div className={`flex flex-col max-w-[90%] sm:max-w-[85%] md:max-w-[80%] ${isOwn ? "items-end" : ""}`}>
        <div className={`flex items-center gap-2 mb-0.5 ${isOwn ? "flex-row-reverse" : ""} relative`}>
          <span
            className={`text-[13px] font-semibold text-text-muted inline-flex items-center gap-1 ${(!isBot && !isOwn && senderId) ? "cursor-pointer hover:underline select-none" : ""}`}
            onClick={(e) => {
              if (!isBot && !isOwn && senderId) {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }
            }}
          >
            {nickname}
            {isBot && <Icons.Bot className="w-3.5 h-3.5 text-ai" aria-label="Bot" />}
          </span>
          {senderId !== undefined && hostId !== undefined && senderId === hostId && (
            <span className="text-[10px] font-bold text-ai bg-ai/15 border border-ai/30 px-1.5 py-0.5 rounded">
              {t("roleHost")}
            </span>
          )}
          {isDice && diceMeta?.psy ? (
            // Psychology hidden roll: header shows eye icon + "仅 KP 可见" + the
            // descriptive content line ("守秘人对 苏雨 进行心理学检定"). Replaces
            // both the regular visibility badge and the command echo.
            <span className="dice-psy-header inline-flex items-center gap-1 text-[11px] text-text-dim">
              <Icons.Eye className="w-3 h-3" />
              {t("visKpOnly")} · <span className="dice-psy-desc">{content}</span>
            </span>
          ) : (
            <>
              {visibilityBadge && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-text-dim">
                  <Icons.Lock className="w-3 h-3" />{visibilityBadge}
                </span>
              )}
              {diceCommandEcho && (
                <span className="dice-echo text-[11px] text-text-dim font-theme-mono">
                  「{diceCommandEcho}」
                </span>
              )}
            </>
          )}

          {showMenu && senderId && (
            <div
              className={`absolute bg-surface border border-border rounded-lg shadow-xl py-1.5 min-w-[120px] z-30 animate-in fade-in zoom-in-95 duration-100 ${
                isOwn ? "right-0" : "left-0"
              }`}
              style={{ top: "100%" }}
              onClick={(e) => e.stopPropagation()}
            >
              {isHost && onViewCharacter && (
                <button
                  onClick={() => {
                    onViewCharacter(senderId, nickname);
                    setShowMenu(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  {tRoom("btnViewCard")}
                </button>
              )}
              {onStartDM && (
                <button
                  onClick={() => {
                    onStartDM(senderId);
                    setShowMenu(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs text-text hover:bg-surface-alt transition cursor-pointer"
                >
                  <Icons.Lock className="w-3.5 h-3.5" /> {tRoom("btnDm")}
                </button>
              )}
            </div>
          )}

          <span className="text-[11px] text-text-dim opacity-0 group-hover:opacity-100 transition">
            {mounted ? formatTime(createdAt, t) : ""}
          </span>
        </div>

        <div
          className={`chat-bubble ${isOwn ? "chat-bubble-own" : "chat-bubble-other"} ${
            isDice ? "chat-bubble-dice" : isPrivate ? "chat-bubble-private" : isImage ? "chat-bubble-image" : "chat-bubble-text"
          } rounded-theme shadow-sm break-words transition-colors ${isImage ? "p-1" : "px-3 py-2"} ${
            isDice
              ? "bg-dice-card-bg border border-dice-card-border text-text"
              : isPrivate
              ? "bg-private-bg border border-private-border text-text"
              : isImage
              ? "bg-surface border border-border text-text"
              : isOwn
              ? "bg-primary/10 border border-primary/40 text-text"
              : "bg-surface border border-border text-text"
          }`}
          data-grade={isDice ? diceMeta?.grade : undefined}
          data-kind={isDice ? diceMeta?.kind : undefined}
          data-roll-kind={isDice ? diceRollKind : undefined}
          data-audience={isDice ? (audience ?? "everyone") : undefined}
          data-insanity={isDice && diceMeta?.insanity ? "true" : undefined}
          data-psy={isDice && diceMeta?.psy ? "true" : undefined}
        >
          {isDice ? (
            diceRollKind === "sanity" ? (
              // Sanity card renders its own header/body/warning — no outer flex/icon wrapper.
              <DiceResultDisplay diceDetail={diceDetail || content} fallback={content} t={t} />
            ) : (
              <div className="dice-bubble flex items-center gap-2 flex-wrap">
                <span className="dice-icon flex items-center justify-center w-7 h-7 rounded-theme bg-primary/10 text-primary border border-primary/30 shrink-0">
                  <RollIcon kind={diceRollKind} grade={diceMeta?.grade ?? "none"} psy={diceMeta?.psy} />
                </span>
                <span className="dice-result inline-flex items-baseline gap-1 font-theme-mono text-sm leading-tight flex-wrap">
                  <DiceResultDisplay diceDetail={diceDetail || content} fallback={content} t={t} />
                </span>
              </div>
            )
          ) : isImage ? (
            imgError ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-text-dim italic">
                <Icons.Image className="w-4 h-4 not-italic" />
                <span>{t("imageUnavailable")}</span>
              </div>
            ) : (
              <>
                <img
                  src={content}
                  alt={t("imageAlt")}
                  loading="lazy"
                  onError={() => setImgError(true)}
                  onClick={() => setPreviewOpen(true)}
                  className="max-h-64 max-w-full w-auto rounded-theme object-contain cursor-zoom-in"
                />
                {previewOpen && (
                  <ImagePreview src={content} alt={t("imageAlt")} onClose={() => setPreviewOpen(false)} />
                )}
              </>
            )
          ) : (
            <MarkdownRenderer content={content} />
          )}
        </div>
      </div>
    </div>
  );
});
