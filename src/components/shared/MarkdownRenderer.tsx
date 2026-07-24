"use client";

import { Fragment } from "react";
import { segmentMentions, type NotebookLinkEntity } from "@/lib/notebook";
import { splitBlocks, splitCodeFences } from "@/lib/markdown-blocks";

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
  return (
    <>
      {splitCodeFences(content).map((part, i) => {
        if (part.kind === "code") {
          return (
            <pre
              key={i}
              className="bg-bg border border-border rounded-theme p-3 my-2 overflow-x-auto text-xs font-theme-mono leading-relaxed"
            >
              {part.lang && (
                <div className="text-[10px] text-text-dim mb-1 uppercase tracking-wider">
                  {part.lang}
                </div>
              )}
              <code>{part.code}</code>
            </pre>
          );
        }
        return <BlockRenderer key={i} text={part.text} mentions={mentions} />;
      })}
    </>
  );
}

const HEADING_CLASS = {
  1: "text-lg font-bold mt-2 mb-1",
  2: "text-base font-bold mt-2 mb-1",
  3: "text-sm font-bold mt-1 mb-0.5",
} as const;

function BlockRenderer({ text, mentions }: { text: string; mentions?: MentionOptions }) {
  return (
    <>
      {splitBlocks(text).map((block) => {
        switch (block.kind) {
          case "heading":
            return (
              <div key={`h-${block.line}`} className={`md-heading md-h${block.level} ${HEADING_CLASS[block.level]}`}>
                <InlineRenderer text={block.text} mentions={mentions} />
              </div>
            );

          case "quote":
            return (
              <blockquote key={`q-${block.line}`} className="md-quote border-l-2 border-accent/50 bg-surface-alt/50 pl-3 pr-2 py-1.5 my-2 text-sm text-text-muted italic rounded-r-theme">
                {block.lines.map((q, qi) => (
                  <p key={qi} className="leading-relaxed">
                    <InlineRenderer text={q} mentions={mentions} />
                  </p>
                ))}
              </blockquote>
            );

          case "list":
            return (
              <ul key={`ul-${block.line}`} className="md-list list-disc pl-5 my-1.5 space-y-1">
                {block.items.map((item, li) => (
                  <li key={li} className="text-sm leading-relaxed">
                    <InlineRenderer text={item} mentions={mentions} />
                  </li>
                ))}
              </ul>
            );

          case "table":
            return (
              <div key={`tbl-${block.line}`} className="my-2 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {block.headers.map((h, hi) => (
                        <th key={hi} className="border border-border bg-surface-alt px-2 py-1 text-left font-bold">
                          <InlineRenderer text={h} mentions={mentions} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
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

          case "break":
            return <div key={`br-${block.line}`} className="h-2" />;

          case "paragraph":
            return (
              <p key={`p-${block.line}`} className="text-sm whitespace-pre-wrap leading-relaxed my-0.5">
                <InlineRenderer text={block.text} mentions={mentions} />
              </p>
            );
        }
      })}
    </>
  );
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
