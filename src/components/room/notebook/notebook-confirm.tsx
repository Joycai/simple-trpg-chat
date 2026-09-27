import { Icons } from "@/components/shared/icons";
import type { Category, Note } from "./notebook-types";

/** Themed stand-in for `confirm()`. `discard` carries the action it guards, so
 *  the drawer-close and the editor-back paths share one dialog. */
export type NotebookConfirm =
  | { kind: "discard"; proceed: () => void }
  | { kind: "deleteNote"; note: Note }
  | { kind: "deleteCategory"; category: Category };

type NotebookT = (key: string, values?: Record<string, string | number>) => string;

/** Title, text, button label and icon of the ConfirmDialog for a pending confirm. */
export function buildConfirmDialogProps(
  confirm: NotebookConfirm,
  t: NotebookT,
  categoryCounts: Map<number | null, number>,
) {
  return {
    title:
      confirm.kind === "discard" ? t("discardConfirmTitle")
      : confirm.kind === "deleteNote" ? t("deleteConfirmTitle")
      : t("deleteCategoryConfirmTitle"),
    description:
      confirm.kind === "discard" ? t("discardConfirm")
      : confirm.kind === "deleteNote" ? t("deleteConfirm", { title: confirm.note.title })
      : t("deleteCategoryConfirm", {
          name: confirm.category.name,
          count: categoryCounts.get(confirm.category.id) ?? 0,
        }),
    confirmLabel:
      confirm.kind === "discard" ? t("discardConfirmAction")
      : confirm.kind === "deleteNote" ? t("delete")
      : t("deleteCategory"),
    icon: confirm.kind === "discard" ? undefined : <Icons.Trash2 className="w-5 h-5" />,
  };
}
