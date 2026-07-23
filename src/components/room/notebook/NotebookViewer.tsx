"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { MarkdownRenderer } from "@/components/shared/MarkdownRenderer";
import { useClickOutside } from "@/lib/useClickOutside";
import { extractMentions, type NotebookCategory, type NotebookLinkEntity } from "@/lib/notebook";
import { CATEGORY_META, MentionChip, formatNoteDateTime, type Note } from "./notebook-helpers";

interface NotebookViewerProps {
  note: Note;
  entities: NotebookLinkEntity[];
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
  /** Mobile-only back-to-list handler. */
  onBack: () => void;
}

/** Read view of a note: header (title / category / edited-at / actions),
 *  markdown body with @-mention chips, and a footer listing linked entries. */
export function NotebookViewer({ note, entities, readOnly, onEdit, onDelete, onBack }: NotebookViewerProps) {
  const t = useTranslations("notebook");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const links = useMemo(() => extractMentions(note.content, entities), [note.content, entities]);
  const catMeta = CATEGORY_META[note.category as NotebookCategory] ?? CATEGORY_META.misc;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Note header */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-start gap-2">
          <button onClick={onBack} className="sm:hidden mt-0.5 p-1.5 -ml-1.5 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer" aria-label={t("back")}>
            <Icons.ArrowLeft className="w-5 h-5" />
          </button>
          <h4 className="notebook-note-title flex-1 text-xl sm:text-2xl font-bold text-text font-theme-display leading-tight min-w-0 break-words">
            {note.title}
          </h4>
          {!readOnly && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onEdit}
                className="flex items-center justify-center w-9 h-9 rounded-theme border border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 transition cursor-pointer"
                title={t("editNote")}
              >
                <Icons.Pencil className="w-4 h-4" />
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="flex items-center justify-center w-9 h-9 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <Icons.MoreVertical className="w-4 h-4" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-theme shadow-xl py-1 min-w-[120px] z-20 overlay-pop" style={{ transformOrigin: "top right" }}>
                    <button
                      onClick={() => { setMenuOpen(false); onDelete(); }}
                      className="w-full text-left flex items-center gap-2 px-3.5 py-2 text-sm text-danger hover:bg-danger/10 transition cursor-pointer"
                    >
                      <Icons.Trash2 className="w-4 h-4" /> {t("delete")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2.5 mt-2 text-xs text-text-muted">
          <span className="notebook-cat-chip inline-flex items-center gap-1 border border-accent/40 text-accent rounded-full px-2.5 py-0.5 font-bold">
            <catMeta.Icon className="w-3 h-3" />
            {t(catMeta.labelKey)}
          </span>
          <span className="font-theme-mono">{formatNoteDateTime(note.updatedAt)} {t("edited")}</span>
        </div>
      </div>

      {/* Markdown body */}
      <div className="notebook-note-body flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
        {note.content.trim() ? (
          <MarkdownRenderer
            content={note.content}
            mentions={{ entities, render: (entity, key) => <MentionChip key={key} entity={entity} className="mx-0.5" /> }}
          />
        ) : (
          <p className="text-sm text-text-dim italic">{t("emptyContent")}</p>
        )}
      </div>

      {/* Linked entries footer */}
      {links.length > 0 && (
        <div className="px-4 sm:px-6 py-3 border-t border-border shrink-0">
          <div className="text-xs text-text-muted mb-2 select-none">
            {t("linksHeader")} · {links.length}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {links.map((e) => <MentionChip key={e.id} entity={e} />)}
          </div>
        </div>
      )}
    </div>
  );
}
