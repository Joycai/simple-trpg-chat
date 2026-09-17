"use client";

/**
 * Text renderers for system pills, check requests, and the `.help` card.
 * Each wraps its leading emoji in a themable span (shrine hides them).
 */

import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { Icons } from "@/components/shared/icons";
import { useRoomRule } from "@/components/shared/host-label";

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
export function SystemPillContent({ content, block }: { content: string; block: boolean }) {
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
 * Wrap each `【skill】` substring in a `<span class="check-request-skill">`
 * so themes can give the skill name its own accent (e.g. shrine paints it gold)
 * without altering the surrounding sentence.
 */
export function renderCheckRequestContent(content: string, highlight?: string | null): React.ReactNode {
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
export function renderCheckProgress(text: string): React.ReactNode {
  const { emoji, rest } = stripLeadingEmoji(text);
  return (
    <>
      {emoji && <span className="check-request-progress-emoji" aria-hidden>{emoji}{" "}</span>}
      {rest}
    </>
  );
}

/** Three-row metadata for system pills, keyed by `systemKind`. */
export const SYSTEM_PILL_META: Record<"st" | "error" | "room-event" | "scene-marker", {
  icon: typeof Icons.CheckSquare;
  className: string;
}> = {
  "st":            { icon: Icons.CheckSquare,    className: "system-pill-body--ok" },
  "error":         { icon: Icons.AlertTriangle,  className: "system-pill-body--err" },
  "room-event":    { icon: Icons.UserPlus,       className: "system-pill-body--info" },
  "scene-marker":  { icon: Icons.Clock,          className: "system-pill-body--info" },
};

/**
 * Help card: structured 2-column command reference. The room's rule picks its
 * rows via `capabilities.helpEntryIds`, each id keying into the
 * `commands.helpEntries` i18n map — so every room documents exactly the
 * commands (and syntax) its rule honors.
 */
export function HelpCard({ visSelfLabel }: { visSelfLabel: string }) {
  const t = useTranslations("commands");
  const rule = useRoomRule();
  let title = "Command Help";
  try { title = t("helpTitle"); } catch { /* fallback */ }
  let entries: Array<{ id: string; cmd: string; desc: string }> = [];
  try {
    const raw = (t as unknown as { raw: (k: string) => unknown }).raw("helpEntries");
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      const map = raw as Record<string, { cmd?: unknown; desc?: unknown } | undefined>;
      entries = rule.capabilities.helpEntryIds.flatMap((id) => {
        const e = map[id];
        return e && typeof e.cmd === "string" && typeof e.desc === "string"
          ? [{ id, cmd: e.cmd, desc: e.desc }]
          : [];
      });
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
          {entries.map((e) => (
            <div key={e.id} className="help-card-row contents">
              <dt className="font-theme-mono text-text">{e.cmd}</dt>
              <dd className="text-text-muted m-0">{e.desc}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
