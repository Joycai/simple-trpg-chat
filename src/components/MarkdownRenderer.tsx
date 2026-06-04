"use client";

import { Fragment } from "react";

/**
 * Lightweight Markdown renderer for chat bubbles.
 * Supports common patterns from LLM output without heavy dependencies.
 */
export function MarkdownRenderer({ content }: { content: string }) {
  // Split by code blocks first
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("```") && part.endsWith("```")) {
          // Code block
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
        return <InlineMarkdown key={i} text={part} />;
      })}
    </>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Split by inline patterns
  const parts = text.split(
    /(\*\*.*?\*\*|__.*?__|`.*?`|~~.*?~~|\[.*?\]\(.*?\)|\n- |\n\d+\. )/g
  );

  return (
    <span className="text-sm whitespace-pre-wrap leading-relaxed">
      {parts.map((part, i) => {
        // Bold (**text** or __text__)
        if (
          (part.startsWith("**") && part.endsWith("**")) ||
          (part.startsWith("__") && part.endsWith("__"))
        ) {
          return (
            <strong key={i} className="font-bold">
              {part.slice(2, -2)}
            </strong>
          );
        }

        // Inline code (`code`)
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code
              key={i}
              className="bg-bg border border-border rounded px-1 py-0.5 text-xs font-theme-mono"
            >
              {part.slice(1, -1)}
            </code>
          );
        }

        // Strikethrough (~~text~~)
        if (part.startsWith("~~") && part.endsWith("~~")) {
          return (
            <del key={i} className="line-through text-text-dim">
              {part.slice(2, -2)}
            </del>
          );
        }

        // Link ([text](url))
        const linkMatch = part.match(/^\[(.+?)\]\((.+?)\)$/);
        if (linkMatch) {
          return (
            <a
              key={i}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {linkMatch[1]}
            </a>
          );
        }

        // List items (currently rendered as plain text with marker)
        if (part.startsWith("\n- ") || part.startsWith("\n1. ")) {
          return (
            <br key={i} />
          );
        }

        return <Fragment key={i}>{part}</Fragment>;
      })}
    </span>
  );
}
