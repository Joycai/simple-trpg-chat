"use client";

import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { mentionQueryAt, type NotebookLinkEntity } from "@/lib/notebook";
import { entityMeta } from "@/components/room/notebook/notebook-helpers";
import { MAX_EVENT_IMAGES } from "@/lib/story-events";
import { createEventAction, updateEventAction, type EventView } from "@/app/actions/event";
import { EventTimePicker } from "./EventTimePicker";

const CHAT_IMAGE_MAX_BYTES = 1024 * 1024;
const MAX_SUGGESTIONS = 6;

function dataUrlToFile(url: string, filename: string): File {
  const [head, body] = url.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

interface EventEditorProps {
  roomId: number;
  event: EventView | null; // null = create
  entities: NotebookLinkEntity[];
  onClose: () => void;
  onSaved: () => void;
}

export function EventEditor({ roomId, event, entities, onClose, onSaved }: EventEditorProps) {
  const t = useTranslations("event");
  const tn = useTranslations("notebook");
  const tCommon = useTranslations("common");

  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [timePayload, setTimePayload] = useState<string | null>(event?.timePayload ?? null);
  const [images, setImages] = useState<string[]>(event?.images ?? []);
  const [saving, setSaving] = useState(false);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return entities.filter((e) => !q || e.title.toLowerCase().includes(q)).slice(0, MAX_SUGGESTIONS);
  }, [mention, entities]);
  const pickerOpen = mention !== null && suggestions.length > 0;

  const syncMention = (el: HTMLTextAreaElement) => {
    setMention(mentionQueryAt(el.value, el.selectionStart ?? 0));
    setActiveIdx(0);
  };
  const insertMention = (entity: NotebookLinkEntity) => {
    const el = textareaRef.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? 0;
    const next = `${description.slice(0, mention.start)}@${entity.title} ${description.slice(caret)}`;
    setDescription(next);
    setMention(null);
    const newCaret = mention.start + entity.title.length + 2;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newCaret, newCaret);
    });
  };
  const startMention = () => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? description.length;
    const next = `${description.slice(0, start)}@${description.slice(el.selectionEnd ?? start)}`;
    setDescription(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
      setMention({ start, query: "" });
    });
  };
  const applyWrap = (before: string, after: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? s;
    const sel = description.slice(s, e);
    setDescription(description.slice(0, s) + before + sel + after + description.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  };
  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? s;
    const lineStart = description.lastIndexOf("\n", s - 1) + 1;
    const block = description.slice(lineStart, e);
    const prefixed = block.split("\n").map((l) => (l.startsWith(prefix) ? l : prefix + l)).join("\n");
    setDescription(description.slice(0, lineStart) + prefixed + description.slice(e));
    requestAnimationFrame(() => el.focus());
  };
  const handleKeyDown = (ev: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!pickerOpen) return;
    if (ev.key === "ArrowDown") { ev.preventDefault(); setActiveIdx((i) => (i + 1) % suggestions.length); }
    else if (ev.key === "ArrowUp") { ev.preventDefault(); setActiveIdx((i) => (i - 1 + suggestions.length) % suggestions.length); }
    else if (ev.key === "Enter" || ev.key === "Tab") { ev.preventDefault(); insertMention(suggestions[activeIdx]); }
    else if (ev.key === "Escape") { ev.preventDefault(); setMention(null); }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setError(t("errImageType")); return; }
    setError(null);
    setCropSource(f);
  };
  const handleCropped = async (dataUrl: string) => {
    setUploading(true);
    setError(null);
    try {
      const file = dataUrlToFile(dataUrl, `event-${Date.now()}.jpg`);
      if (file.size > CHAT_IMAGE_MAX_BYTES) { setError(t("errImageTooLarge")); return; }
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/rooms/${roomId}/images`, { method: "POST", body: fd });
      if (!res.ok) { setError(res.status === 413 ? t("errImageTooLarge") : tCommon("error")); return; }
      const { url } = await res.json();
      setImages((prev) => [...prev, url].slice(0, MAX_EVENT_IMAGES));
      setCropSource(null);
    } catch {
      setError(tCommon("error"));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const payload = { title: title.trim(), description, timePayload, images };
      if (event) await updateEventAction(roomId, event.id, payload);
      else await createEventAction(roomId, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon("error"));
      setSaving(false);
    }
  };

  const toolBtn = "flex items-center justify-center w-8 h-8 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer";

  return (
    <OverlayShell onClose={onClose} portal panelClassName="w-full max-w-2xl mx-4 h-[86vh] max-h-[720px] min-h-[560px] bg-surface theme-border rounded-theme shadow-2xl flex flex-col overflow-hidden">
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
            <Icons.Pencil className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-text text-lg font-theme-display flex-1 truncate">
              {event ? t("editTitle") : t("createTitle")}
            </h3>
            <button onClick={close} className={toolBtn} aria-label={tCommon("cancel")}><Icons.X className="w-5 h-5" /></button>
          </div>

          {/* Fixed-height body: title / time / images keep their natural size,
              only the description flexes into whatever height is left over. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* Title */}
            <div className="shrink-0">
              <label className="block text-xs font-bold text-text-muted mb-1.5">{t("fieldTitle")}</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                autoFocus={!event}
                placeholder={t("titlePlaceholder")}
                className="w-full bg-input-bg border border-input-border rounded-theme px-3.5 py-2.5 text-base font-bold text-text outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary/50"
              />
            </div>

            {/* Time */}
            <div className="shrink-0">
              <label className="block text-xs font-bold text-text-muted mb-1.5">{t("fieldTime")} <span className="text-text-dim font-medium">· {t("optional")}</span></label>
              <EventTimePicker value={timePayload} onChange={setTimePayload} />
            </div>

            {/* Description — the only elastic region, guaranteed a visible min height */}
            <div className="flex-1 min-h-[9rem] flex flex-col">
              <label className="block text-xs font-bold text-text-muted mb-1.5 shrink-0">{t("fieldDescription")}</label>
              <div className="flex items-center gap-0.5 border border-border border-b-0 rounded-t-theme px-2 py-1.5 bg-surface-alt/50 shrink-0">
                <button onClick={() => applyLinePrefix("## ")} className={toolBtn} title={t("toolHeading")}><Icons.Heading2 className="w-4 h-4" /></button>
                <button onClick={() => applyWrap("**", "**")} className={toolBtn} title={t("toolBold")}><Icons.Bold className="w-4 h-4" /></button>
                <button onClick={() => applyWrap("*", "*")} className={toolBtn} title={t("toolItalic")}><Icons.Italic className="w-4 h-4" /></button>
                <span className="w-px h-4 bg-border mx-1" aria-hidden />
                <button onClick={() => applyLinePrefix("- ")} className={toolBtn} title={t("toolList")}><Icons.List className="w-4 h-4" /></button>
                <button onClick={() => applyLinePrefix("> ")} className={toolBtn} title={t("toolQuote")}><Icons.Quote className="w-4 h-4" /></button>
                <span className="w-px h-4 bg-border mx-1" aria-hidden />
                <button onClick={startMention} className={`${toolBtn} text-primary hover:text-primary`} title={t("toolMention")}><Icons.AtSign className="w-4 h-4" /></button>
                <span className="ml-auto text-xs text-text-dim font-theme-mono select-none pr-1">Markdown</span>
              </div>
              <div className="relative flex-1 min-h-0">
                <textarea
                  ref={textareaRef}
                  value={description}
                  onChange={(e) => { setDescription(e.target.value); syncMention(e.target); }}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => syncMention(e.currentTarget)}
                  onBlur={() => setTimeout(() => setMention(null), 150)}
                  placeholder={t("descriptionPlaceholder")}
                  className="w-full h-full resize-none bg-input-bg border border-input-border rounded-b-theme px-3.5 py-3 text-sm text-text leading-relaxed outline-none focus:border-primary/50"
                />
                {pickerOpen && (
                  <div className="absolute left-2 sm:w-80 bottom-2 bg-surface border border-border rounded-theme shadow-xl overflow-hidden z-10">
                    <div className="flex items-center gap-2 px-3.5 py-2 border-b border-border">
                      <span className="text-sm font-bold text-primary font-theme-mono">@{mention?.query}</span>
                      <span className="text-xs text-text-muted">{t("mentionHeader")}</span>
                    </div>
                    <div className="max-h-52 overflow-y-auto py-1">
                      {suggestions.map((e, i) => {
                        const { Icon, labelKey, chipClass } = entityMeta(e.type);
                        return (
                          <button
                            key={e.id}
                            onMouseDown={(ev) => { ev.preventDefault(); insertMention(e); }}
                            onMouseEnter={() => setActiveIdx(i)}
                            className={`w-full text-left flex items-center gap-3 px-3 py-2 transition cursor-pointer ${i === activeIdx ? "bg-surface-alt" : ""}`}
                          >
                            <span className={`flex items-center justify-center w-8 h-8 rounded-theme border shrink-0 ${chipClass}`}><Icon className="w-4 h-4" /></span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-bold text-text truncate">{e.title}</span>
                              <span className="block text-xs text-text-muted">{tn(labelKey)}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Images */}
            <div className="shrink-0">
              <label className="block text-xs font-bold text-text-muted mb-1.5">
                {t("fieldImages")} <span className="text-text-dim font-medium">· {t("imagesHint")}</span>
              </label>
              <div className="flex gap-2.5 flex-wrap">
                {images.map((url, i) => (
                  <div key={url} className="relative w-[84px] h-[84px] rounded-theme border border-border overflow-hidden group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {i === 0 && <span className="absolute top-1 left-1 text-[9px] font-bold font-theme-mono bg-primary text-primary-foreground px-1.5 rounded">{t("cover")}</span>}
                    <button
                      onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white flex items-center justify-center opacity-90 hover:bg-danger transition"
                      title={t("delete")}
                    >
                      <Icons.X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {images.length < MAX_EVENT_IMAGES && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="w-[84px] h-[84px] rounded-theme border border-dashed border-border flex flex-col items-center justify-center gap-1 text-text-dim hover:text-primary hover:border-primary/50 transition cursor-pointer disabled:opacity-50"
                  >
                    {uploading ? <Icons.Loader2 className="w-5 h-5 animate-spin" /> : <Icons.ImagePlus className="w-5 h-5" />}
                    <span className="text-[11px]">{t("addImage")}</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pickFile} />
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border shrink-0">
            <button onClick={close} className="px-4 py-2 rounded-theme border border-border text-text text-sm font-bold hover:bg-surface-alt transition cursor-pointer">{tCommon("cancel")}</button>
            <button
              onClick={handleSave}
              disabled={!title.trim() || saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-theme bg-primary text-primary-foreground text-sm font-bold shadow-[var(--theme-glow)] hover:bg-primary-hover transition disabled:opacity-50 cursor-pointer"
            >
              {saving && <Icons.Loader2 className="w-4 h-4 animate-spin" />}
              <Icons.Check className="w-4 h-4" /> {t("save")}
            </button>
          </div>

          {cropSource && (
            <ImageCropper
              file={cropSource}
              maxOutputBytes={CHAT_IMAGE_MAX_BYTES}
              onCancel={() => setCropSource(null)}
              onConfirm={handleCropped}
            />
          )}
        </>
      )}
    </OverlayShell>
  );
}
