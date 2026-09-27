"use client";

// Shown only when the root layout itself fails. It replaces that layout, so
// none of the app's own plumbing is here: no globals.css (so no theme tokens —
// the colors below are the one place in the app that hardcodes them), no
// fonts, and no next-intl provider (so the copy is written in both languages).
// It follows the OS color scheme, as Next's docs suggest for this file.

const css = `
  :root { color-scheme: light dark; --bg: #f8fafc; --text: #334155; --dim: #64748b; --accent: #2563eb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #0d1e28; --text: #e2e8f0; --dim: #94a3b8; --accent: #60a5fa; }
  }
  body {
    margin: 0; min-height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 0 16px; text-align: center; background: var(--bg); color: var(--text);
    font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  h1 { margin: 0; font-size: 24px; }
  p { margin: 0; font-size: 14px; color: var(--dim); }
  button {
    font: inherit; font-size: 14px; font-weight: 700; color: var(--accent); background: transparent;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: 8px; padding: 6px 12px; cursor: pointer;
  }
  button:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .digest { font-family: ui-monospace, monospace; font-size: 12px; }
`;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="zh">
      <head>
        <title>出错了 · Error</title>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <h1>出错了 · Something went wrong</h1>
        <p>页面无法加载，请重试。 · The page failed to load. Please try again.</p>
        <button onClick={() => retry()}>重试 · Retry</button>
        {error.digest && <p className="digest">错误编号 · Error ID: {error.digest}</p>}
      </body>
    </html>
  );
}
