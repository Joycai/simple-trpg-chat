"use client";

import { Fragment } from "react";
import { segmentMentions, type NotebookLinkEntity } from "@/lib/notebook";

/**
 * Optional @-mention support (notebook). When provided, plain-text runs are
 * scanned for `@Title` tokens matching an entity title and rendered via
 * `render`; unmatched `@` text stays literal, so a deleted backpack item
 * degrades to plain text. Chat callers simply omit the prop.
 */
export interface MentionOptions {
  entities: NotebookLinkEntity[];
  render: (entity: NotebookLinkEntity, key: string) => React.ReactNode;
}

/**
 * Lightweight Markdown renderer for chat bubbles and notebook notes.
 * Supports common LLM output patterns: headings, tables, code blocks,
 * blockquotes, bullet lists, bold, italic, inline code, strikethrough, links.
 */
export function MarkdownRenderer({ content, mentions }: { content: string; mentions?: MentionOptions }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          const code = part.slice(3, -3).trim();
          const [lang, ...rest] = code.split("\n");
          const isLang = !/\s/.test(lang) && lang.length < 20;
          return (
            <pre
              key={i}
              className="bg-bg border border-border rounded-theme p-3 my-2 overflow-x-auto text-xs font-theme-mono leading-relaxed"
            >
              {isLang && (
                <div className="text-[10px] text-text-dim mb-1 uppercase tracking-wider">
                  {lang}
                </div>
              )}
              <code>{isLang ? rest.join("\n") : code}</code>
            </pre>
          );
        }
        return <BlockRenderer key={i} text={part} mentions={mentions} />;
      })}
    </>
  );
}

function BlockRenderer({ text, mentions }: { text: string; mentions?: MentionOptions }) {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Heading: ### / ## / #
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1
        ? "text-lg font-bold mt-2 mb-1"
        : level === 2
        ? "text-base font-bold mt-2 mb-1"
        : "text-sm font-bold mt-1 mb-0.5";
      result.push(
        <div key={`h-${i}`} className={`md-heading md-h${level} ${cls}`}>
          <InlineRenderer text={headingMatch[2]} mentions={mentions} />
        </div>
      );
      i++;
      continue;
    }

    // Blockquote: consecutive lines starting with >
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      result.push(
        <blockquote key={`q-${i}`} className="md-quote border-l-2 border-accent/50 bg-surface-alt/50 pl-3 pr-2 py-1.5 my-2 text-sm text-text-muted italic rounded-r-theme">
          {quoteLines.map((q, qi) => (
            <p key={qi} className="leading-relaxed">
              <InlineRenderer text={q} mentions={mentions} />
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Bullet list: consecutive lines starting with "- " or "* "
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      result.push(
        <ul key={`ul-${i}`} className="md-list list-disc pl-5 my-1.5 space-y-1">
          {items.map((item, li) => (
            <li key={li} className="text-sm leading-relaxed">
              <InlineRenderer text={item} mentions={mentions} />
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Table detection: line starts with | and contains at least one more |
    if (line.startsWith("|") && line.includes("|", 1)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|") && lines[i].includes("|", 1)) {
        tableLines.push(lines[i]);
        i++;
      }
      // Skip separator row (|---|---|)
      const dataRows = tableLines.filter(l => !/^\|[\s\-:|]+\|$/.test(l));
      if (dataRows.length > 0) {
        const headers = parseTableRow(dataRows[0]);
        const body = dataRows.length > 1 ? dataRows.slice(1).map(parseTableRow) : [];
        result.push(
          <div key={`tbl-${i}`} className="my-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {headers.map((h, hi) => (
                    <th key={hi} className="border border-border bg-surface-alt px-2 py-1 text-left font-bold">
                      <InlineRenderer text={h} mentions={mentions} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-border px-2 py-1">
                        <InlineRenderer text={cell} mentions={mentions} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Empty line
    if (line.trim() === "") {
      result.push(<div key={`br-${i}`} className="h-2" />);
      i++;
      continue;
    }

    // Regular paragraph: collect until empty line or special block
    result.push(
      <p key={`p-${i}`} className="text-sm whitespace-pre-wrap leading-relaxed my-0.5">
        <InlineRenderer text={line} mentions={mentions} />
      </p>
    );
    i++;
  }

  return <>{result}</>;
}

/** Parse a table row like | col1 | col2 | col3 | */
function parseTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(c => c.trim());
}

/** Render a plain-text run, expanding @-mentions when the caller opted in. */
function PlainText({ text, mentions, keyPrefix }: { text: string; mentions?: MentionOptions; keyPrefix: string }) {
  if (!mentions || mentions.entities.length === 0) return <>{text}</>;
  return (
    <>
      {segmentMentions(text, mentions.entities).map((seg, si) =>
        seg.kind === "mention"
          ? <Fragment key={`${keyPrefix}-m-${si}`}>{mentions.render(seg.entity, `${keyPrefix}-m-${si}`)}</Fragment>
          : <Fragment key={`${keyPrefix}-t-${si}`}>{seg.text}</Fragment>
      )}
    </>
  );
}

function InlineRenderer({ text, mentions }: { text: string; mentions?: MentionOptions }) {
  const parts = text.split(
    /(\*\*.*?\*\*|__.*?__|`.*?`|~~.*?~~|\[.*?\]\(.*?\)|\*[^*\n]+\*)/g
  );

  return (
    <>
      {parts.map((part, i) => {
        // Bold
        if (
          (part.startsWith("**") && part.endsWith("**")) ||
          (part.startsWith("__") && part.endsWith("__"))
        ) {
          return <strong key={i} className="font-bold"><PlainText text={part.slice(2, -2)} mentions={mentions} keyPrefix={`b${i}`} /></strong>;
        }
        // Inline code
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="bg-bg border border-border rounded px-1 py-0.5 text-xs font-theme-mono">
              {part.slice(1, -1)}
            </code>
          );
        }
        // Strikethrough
        if (part.startsWith("~~") && part.endsWith("~~")) {
          return <del key={i} className="line-through text-text-dim">{part.slice(2, -2)}</del>;
        }
        // Italic (single *) — the split regex only captures this when the
        // bold alternative didn't match first, so ** never lands here.
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={i} className="italic"><PlainText text={part.slice(1, -1)} mentions={mentions} keyPrefix={`i${i}`} /></em>;
        }
        // Link
        const linkMatch = part.match(/^\[(.+?)\]\((.+?)\)$/);
        if (linkMatch) {
          const href = /^https?:\/\//i.test(linkMatch[2]) || /^mailto:/i.test(linkMatch[2])
            ? linkMatch[2]
            : "#";
          return (
            <a key={i} href={href} target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline">
              {linkMatch[1]}
            </a>
          );
        }
        return <Fragment key={i}><PlainText text={part} mentions={mentions} keyPrefix={`p${i}`} /></Fragment>;
      })}
    </>
  );
}
