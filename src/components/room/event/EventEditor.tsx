"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icons } from "@/components/shared/icons";
import { OverlayShell } from "@/components/shared/OverlayShell";
import { ImageCropper } from "@/components/shared/ImageCropper";
import { useMentionTextarea } from "@/components/room/hooks/useMentionTextarea";
import { MentionPicker } from "@/components/room/MentionPicker";
import { type NotebookLinkEntity } from "@/lib/notebook";
import { MAX_EVENT_IMAGES, EVENT_TITLE_MAX, EVENT_DESC_MAX } from "@/lib/story-events";
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
  /** When true, the description editor takes over the whole modal body — the
   *  title / time / images sections collapse away, giving the textarea room. */
  const [descExpanded, setDescExpanded] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const {
    textareaRef, textareaProps, mention, activeIdx, setActiveIdx,
    suggestions, pickerOpen, insertMention, startMention, applyWrap, applyLinePrefix,
  } = useMentionTextarea({ value: description, setValue: setDescription, entities, maxSuggestions: MAX_SUGGESTIONS });

  /** Unsaved-work guard for the modal's close paths. */
  const dirty =
    title !== (event?.title ?? "") ||
    description !== (event?.description ?? "") ||
    timePayload !== (event?.timePayload ?? null) ||
    images.join(" ") !== (event?.images ?? []).join(" ");

  const handleClose = () => { if (!dirty || confirm(t("discardConfirm"))) onClose(); };

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
      const res = event
        ? await updateEventAction(roomId, event.id, payload)
        : await createEventAction(roomId, payload);
      if (!res.success) {
        // Already localized server-side; `err.message` used to show Next's
        // production redaction notice here instead.
        setError(res.error);
        setSaving(false);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError(tCommon("error"));
      setSaving(false);
    }
  };

  const toolBtn = "flex items-center justify-center w-8 h-8 rounded-theme text-text-muted hover:text-text hover:bg-surface-alt transition cursor-pointer";

  return (
    <OverlayShell onClose={handleClose} portal panelClassName="w-full max-w-2xl mx-4 h-[86vh] max-h-[720px] min-h-[560px] bg-surface theme-border rounded-theme shadow-2xl flex flex-col overflow-hidden">
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
              only the description flexes into whatever height is left over. The
              header/images groups collapse via an animated grid-rows track
              (0fr↔1fr) so toggling full-window edit eases open/closed. */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col">
            {/* Collapsible header group — title + time */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${descExpanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
              <div className={`min-h-0 overflow-hidden flex flex-col gap-4 pb-4 transition-opacity duration-200 ${descExpanded ? "opacity-0" : "opacity-100"}`} inert={descExpanded || undefined}>
                {/* Title */}
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">{t("fieldTitle")}</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={EVENT_TITLE_MAX}
                    autoFocus={!event}
                    placeholder={t("titlePlaceholder")}
                    className="w-full bg-input-bg border border-input-border rounded-theme px-3.5 py-2.5 text-base font-bold text-text outline-none focus:ring-[3px] focus:ring-primary/[0.18] focus:border-primary/50"
                  />
                </div>

                {/* Time */}
                <div>
                  <label className="block text-xs font-bold text-text-muted mb-1.5">{t("fieldTime")} <span className="text-text-dim font-medium">· {t("optional")}</span></label>
                  <EventTimePicker value={timePayload} onChange={setTimePayload} />
                </div>
              </div>
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
                <span className="ml-auto flex items-center gap-2 pr-1 text-xs font-theme-mono select-none">
                  <span className={description.length > EVENT_DESC_MAX * 0.9 ? "text-warning" : "text-text-dim"}>
                    {description.length} / {EVENT_DESC_MAX}
                  </span>
                  <span className="text-text-dim">{tn("markdownLabel")}</span>
                </span>
                <span className="w-px h-4 bg-border mx-1" aria-hidden />
                <button
                  onClick={() => setDescExpanded((v) => !v)}
                  className={`${toolBtn} ${descExpanded ? "text-primary" : ""}`}
                  title={descExpanded ? t("collapseEditor") : t("expandEditor")}
                  aria-pressed={descExpanded}
                >
                  {descExpanded ? <Icons.Minimize2 className="w-4 h-4" /> : <Icons.Maximize2 className="w-4 h-4" />}
                </button>
              </div>
              <div className="relative flex-1 min-h-0">
                <textarea
                  ref={textareaRef}
                  value={description}
                  {...textareaProps}
                  maxLength={EVENT_DESC_MAX}
                  placeholder={t("descriptionPlaceholder")}
                  className="w-full h-full resize-none bg-input-bg border border-input-border rounded-b-theme px-3.5 py-3 text-sm text-text leading-relaxed outline-none focus:border-primary/50"
                />
                {pickerOpen && (
                  <MentionPicker
                    query={mention?.query ?? ""}
                    suggestions={suggestions}
                    activeIdx={activeIdx}
                    onPick={insertMention}
                    onHover={setActiveIdx}
                    className="left-2 sm:w-80 bottom-2"
                    accentClass="text-primary"
                  />
                )}
              </div>
            </div>

            {/* Collapsible images group */}
            <div className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${descExpanded ? "grid-rows-[0fr]" : "grid-rows-[1fr]"}`}>
            <div className={`min-h-0 overflow-hidden pt-4 transition-opacity duration-200 ${descExpanded ? "opacity-0" : "opacity-100"}`} inert={descExpanded || undefined}>
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
            </div>

            {error && <p className="text-sm text-danger pt-2">{error}</p>}
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
