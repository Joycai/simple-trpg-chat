"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { NOTEBOOK_COLORS, CATEGORY_NAME_MAX, CATEGORY_MAX_COUNT, type NotebookColor } from "@/lib/notebook";
import { colorMeta, type Category } from "./notebook-helpers";

export type CategoryFilter = "all" | "uncat" | number;

interface NotebookCategoryListProps {
  categories: Category[];
  /** Note count per categoryId (null bucket = uncategorized). */
  counts: Map<number | null, number>;
  totalCount: number;
  active: CategoryFilter;
  onSelect: (filter: CategoryFilter) => void;
  readOnly: boolean;
  onCreate: (input: { name: string; color: NotebookColor }) => Promise<void>;
  onUpdate: (id: number, input: { name: string; color: NotebookColor }) => Promise<void>;
  onDelete: (category: Category) => Promise<void>;
}

/** Inline name + 7-swatch color form, shared by "edit" and "new" states. */
function CategoryForm({
  initialName,
  initialColor,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initialName: string;
  initialColor: NotebookColor;
  onSubmit: (input: { name: string; color: NotebookColor }) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}) {
  const t = useTranslations("notebook");
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<NotebookColor>(initialColor);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), color });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="notebook-cat-form border border-accent/40 rounded-theme p-2.5 space-y-2 bg-surface-alt/50">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void submit(); else if (e.key === "Escape") onCancel(); }}
        maxLength={CATEGORY_NAME_MAX}
        placeholder={t("categoryNamePlaceholder")}
        autoFocus
        className="w-full bg-input-bg border border-input-border rounded-theme px-2.5 py-1.5 text-sm text-text outline-none focus:ring-[3px] focus:ring-accent/[0.18] focus:border-accent/50"
      />
      {/* 7 predefined label colors */}
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={t("colorLabel")}>
        {NOTEBOOK_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            role="radio"
            aria-checked={color === c}
            title={t(`color_${c}`)}
            className={`w-5 h-5 rounded-full cursor-pointer transition ${colorMeta(c).dot} ${
              color === c ? "ring-2 ring-offset-1 ring-text/60 ring-offset-surface scale-110" : "opacity-70 hover:opacity-100"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => void submit()}
          disabled={!name.trim() || busy}
          className="flex-1 flex items-center justify-center gap-1 h-7 rounded-theme bg-accent text-accent-foreground text-xs font-bold hover:bg-accent-hover transition disabled:opacity-50 cursor-pointer"
        >
          <Icons.Check className="w-3.5 h-3.5" /> {t("save")}
        </button>
        {onDelete && (
          <button
            onClick={() => void onDelete()}
            disabled={busy}
            title={t("deleteCategory")}
            className="flex items-center justify-center w-7 h-7 rounded-theme text-danger hover:bg-danger/10 transition cursor-pointer disabled:opacity-50"
          >
            <Icons.Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={onCancel}
          className="flex items-center justify-center w-7 h-7 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer"
        >
          <Icons.X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Sidebar category navigation: 全部 / user categories (color dot + count,
 * hover pencil opens the inline edit form) / uncategorized bucket (only when
 * non-empty) / dashed add-category row.
 */
export function NotebookCategoryList({
  categories,
  counts,
  totalCount,
  active,
  onSelect,
  readOnly,
  onCreate,
  onUpdate,
  onDelete,
}: NotebookCategoryListProps) {
  const t = useTranslations("notebook");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const uncatCount = counts.get(null) ?? 0;

  const row = (
    filter: CategoryFilter,
    label: string,
    count: number,
    leading: React.ReactNode,
    trailingEdit?: () => void,
  ) => {
    const isActive = active === filter;
    return (
      <div key={String(filter)} className="group relative">
        <button
          onClick={() => onSelect(filter)}
          aria-pressed={isActive}
          className={`notebook-cat w-full flex items-center gap-2.5 px-3 py-2 rounded-theme text-sm transition cursor-pointer border-l-2 ${
            isActive
              ? "bg-accent/10 text-accent font-bold border-accent"
              : "text-text-muted hover:text-text hover:bg-surface-alt border-transparent"
          }`}
        >
          {leading}
          <span className="flex-1 text-left truncate">{label}</span>
          <span className={`text-xs font-theme-mono opacity-70 ${trailingEdit ? "group-hover:opacity-0" : ""}`}>{count}</span>
        </button>
        {trailingEdit && (
          <button
            onClick={trailingEdit}
            title={t("editCategory")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-theme text-text-dim hover:text-accent opacity-0 group-hover:opacity-100 transition cursor-pointer"
          >
            <Icons.Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {row("all", t("catAll"), totalCount, <Icons.Box className="w-4 h-4 shrink-0" />)}

      {categories.map((cat) =>
        editingId === cat.id ? (
          <CategoryForm
            key={cat.id}
            initialName={cat.name}
            initialColor={(cat.color as NotebookColor) || "neutral"}
            onSubmit={async (input) => { await onUpdate(cat.id, input); setEditingId(null); }}
            onCancel={() => setEditingId(null)}
            onDelete={async () => { await onDelete(cat); setEditingId(null); }}
          />
        ) : (
          row(
            cat.id,
            cat.name,
            counts.get(cat.id) ?? 0,
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${colorMeta(cat.color).dot}`} />,
            readOnly ? undefined : () => { setAdding(false); setEditingId(cat.id); },
          )
        )
      )}

      {uncatCount > 0 &&
        row("uncat", t("uncategorized"), uncatCount, <span className="w-2.5 h-2.5 rounded-full border border-text-dim shrink-0" />)}

      {!readOnly && (adding ? (
        <CategoryForm
          initialName=""
          initialColor="primary"
          onSubmit={async (input) => { await onCreate(input); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        categories.length < CATEGORY_MAX_COUNT && (
          <button
            onClick={() => { setEditingId(null); setAdding(true); }}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-theme text-xs text-text-dim hover:text-accent border border-dashed border-border hover:border-accent/50 transition cursor-pointer"
          >
            <Icons.Plus className="w-3.5 h-3.5" /> {t("newCategory")}
          </button>
        )
      ))}
    </div>
  );
}
