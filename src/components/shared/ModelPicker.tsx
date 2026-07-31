"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { fetchProviderModels } from "@/app/actions/ai-providers";
import { getVendor } from "@/lib/provider-presets";
import { useEscapeToClose } from "@/lib/overlay-esc";

/**
 * Model combobox for the provider create/edit forms: free-text input plus a
 * dropdown seeded with the vendor's preset models, with an action row that
 * pulls the live list from the vendor's `/models` endpoint (needs endpoint +
 * API key — falls back to the stored key when editing).
 */
interface ModelPickerProps {
  value: string;
  onChange: (model: string) => void;
  vendor: string;
  endpoint: string;
  /** Current plaintext key in the form (may be empty while editing). */
  apiKey: string;
  /** Existing provider id when editing — lets the server use the stored key. */
  providerId?: number | null;
  /**
   * Translator bound to `adminProviders`. Must resolve `modelPlaceholder`,
   * `btnFetchModels`, `fetchingModels`, and `modelListHeader`.
   */
  t: (key: string) => string;
  inputClassName: string;
}

export function ModelPicker({ value, onChange, vendor, endpoint, apiKey, providerId, t, inputClassName }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Fetched list is keyed by vendor+endpoint so a vendor switch invalidates
  // the previous endpoint's results without an effect.
  const [fetchState, setFetchState] = useState<{ key: string; models: string[] | null; error: string }>({
    key: "",
    models: null,
    error: "",
  });
  const rootRef = useRef<HTMLDivElement>(null);

  const fetchKey = `${vendor}|${endpoint}`;
  const fetched = fetchState.key === fetchKey ? fetchState.models : null;
  const error = fetchState.key === fetchKey ? fetchState.error : "";

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
    };
  }, [open]);

  // Escape closes just this dropdown while it's the topmost overlay.
  useEscapeToClose(() => setOpen(false), open);

  const presetModels = getVendor(vendor)?.models.map((m) => m.id) ?? [];
  const models = fetched ?? presetModels;

  const handleFetch = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await fetchProviderModels({ vendor, endpoint, apiKey, providerId });
      if ("models" in result) {
        setFetchState({ key: fetchKey, models: result.models, error: "" });
      } else {
        setFetchState({ key: fetchKey, models: null, error: result.error });
      }
    } catch (e: unknown) {
      setFetchState({ key: fetchKey, models: null, error: e instanceof Error ? e.message : String(e) });
    }
    setLoading(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("modelPlaceholder")}
        className={`${inputClassName} pr-9`}
      />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-dim hover:text-text transition cursor-pointer"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-surface border border-border rounded-theme overflow-hidden shadow-[var(--theme-card-shadow)]">
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-primary hover:bg-surface-alt border-b border-border/60 transition cursor-pointer disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {loading ? t("fetchingModels") : t("btnFetchModels")}
          </button>

          {error && <p className="px-3 py-2 text-xs text-danger border-b border-border/60">{error}</p>}

          {models.length > 0 && (
            <>
              <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-text-dim bg-surface-alt/40">
                {t("modelListHeader")} · {models.length}
              </div>
              <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
                {models.map((m) => {
                  const active = m === value;
                  return (
                    <li key={m}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(m);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm font-theme-mono transition cursor-pointer ${
                          active ? "bg-primary/10 text-primary" : "text-text hover:bg-surface-alt"
                        }`}
                      >
                        <span className="flex-1 truncate">{m}</span>
                        {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
