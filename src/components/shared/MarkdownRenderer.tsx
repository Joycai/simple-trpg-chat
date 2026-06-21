"use client";

import { Fragment } from "react";

/**
 * Lightweight Markdown renderer for chat bubbles.
 * Supports common LLM output patterns: headings, tables, code blocks,
 * bold, italic, inline code, strikethrough, links, lists.
 */
export function MarkdownRenderer({ content }: { content: string }) {
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
        return <BlockRenderer key={i} text={part} />;
      })}
    </>
  );
}

function BlockRenderer({ text }: { text: string }) {
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
        <div key={`h-${i}`} className={cls}>
          <InlineRenderer text={headingMatch[2]} />
        </div>
      );
      i++;
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
                      <InlineRenderer text={h} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-border px-2 py-1">
                        <InlineRenderer text={cell} />
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
        <InlineRenderer text={line} />
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

function InlineRenderer({ text }: { text: string }) {
  const parts = text.split(
    /(\*\*.*?\*\*|__.*?__|`.*?`|~~.*?~~|\[.*?\]\(.*?\))/g
  );

  return (
    <>
      {parts.map((part, i) => {
        // Bold
        if (
          (part.startsWith("**") && part.endsWith("**")) ||
          (part.startsWith("__") && part.endsWith("__"))
        ) {
          return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
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
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
