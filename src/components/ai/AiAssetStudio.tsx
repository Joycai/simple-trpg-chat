'use client';
/* Authenticated candidate images cannot be served through the public image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ImageIcon, Sparkles, X, Check } from 'lucide-react';
import { OverlayShell } from '@/components/shared/OverlayShell';
import { BadgeDropdown } from '@/components/shared/BadgeDropdown';
import { Notice } from '@/components/shared/Notice';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ImageCropper } from '@/components/shared/ImageCropper';
import { useAsyncAction } from '@/lib/ui/useAsyncAction';
import { loadAssetStudio, createAssetSession, submitAssetGeneration, deleteAssetCandidate, saveGeneratedPortrait } from '@/app/actions/asset-studio';
import type { AssetKind, AssetView, AssetService, StudioState } from '@/lib/ai/assets/types';

const field = 'w-full bg-input-bg border border-input-border rounded-theme p-3 text-text placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-primary/40';
const secondary = 'px-3 py-2 min-h-11 rounded-theme border border-border text-text hover:bg-surface-alt focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50';
const primary = 'px-4 py-2 min-h-11 rounded-theme bg-primary text-primary-foreground font-semibold disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-primary';
export interface AssetStudioProps {
  roomId: number; kind: AssetKind; targetKey: string; initialPrompt: string;
  onClose: () => void; onSelect?: (url: string) => void;
}
export function AiAssetStudio({ roomId, kind, targetKey, initialPrompt, onClose, onSelect }: AssetStudioProps) {
  const t = useTranslations('assetStudio');
  const router = useRouter();
  const titleId = useId();
  const promptId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<StudioState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [service, setService] = useState<AssetService | null>(null);
  const [style, setStyle] = useState('styles');
  const [purpose, setPurpose] = useState<string>(kind);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState('description');
  const [confirm, setConfirm] = useState<'replace' | 'delete' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [crop, setCrop] = useState<{ asset: AssetView; file: File } | null>(null);
  const closeAfterCrop = useRef<(() => void) | null>(null);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const firstLoad = useRef(true);
  const readVersion = useRef(0);
  const mutating = useRef(false);
  const liveSession = useRef(sessionId);
  useLayoutEffect(() => { liveSession.current = sessionId; }, [sessionId]);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const refresh = useCallback(async () => {
    if (mutating.current) return;
    const version = ++readVersion.current;
    const requested = sessionId;
    try {
      const next = await loadAssetStudio(roomId, kind, requested);
      if (liveSession.current !== requested || version !== readVersion.current) return;
      if (firstLoad.current) {
        firstLoad.current = false;
        const previous = next.sessions.find(s => s.targetKey === targetKey);
        if (!requested && previous) { liveSession.current = previous.id; setSessionId(previous.id); setPrompt(previous.prompt); return; }
      }
      setService(current => current ?? next.services[0] ?? null);
      setState(next); setLoadError(false); setRefreshedAt(Date.now());
      setSelectedId(id => next.assets.some(a => a.id === id) ? id : next.assets[0]?.id ?? '');
    } catch { if (version === readVersion.current) setLoadError(true); }
  }, [roomId, kind, sessionId, targetKey]);
  useEffect(() => {
    let mounted = true;
    const load = async () => { if (mounted) await refresh(); };
    void load();
    const timer = setInterval(() => { void load(); }, 4000);
    return () => { mounted = false; clearInterval(timer); };
  }, [refresh]);
  const currentService = state?.services.find(p => p.id === service?.id);
  const serviceChanged = !!service && (!currentService || currentService.quote !== service.quote);
  const selected = state?.assets.find(a => a.id === selectedId);
  const active = state?.tasks.find(task => ['queued', 'pending', 'generated'].includes(task.status));
  const fullPrompt = [prompt.trim(), `${t('purpose')}: ${t(purpose)}`, style !== 'styles' ? `${t('style')}: ${t(style)}` : ''].filter(Boolean).join('\n');
  const submit = useAsyncAction(async () => {
    if (mutating.current) return;
    if (serviceChanged) return { success: false as const, error: t('quoteChanged') };
    if (!service || !prompt.trim()) return { success: false as const, error: t('invalid') };
    mutating.current = true;
    readVersion.current++;
    try {
      let id = sessionId;
      if (!id) {
        const created = await createAssetSession(roomId, { kind, targetKey, prompt });
        if (!created.success) return created;
        id = created.id; setSessionId(id); liveSession.current = id;
      }
      const signature = JSON.stringify([id, service.id, service.quote, fullPrompt]);
      if (request.current?.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
      const result = await submitAssetGeneration(roomId, { sessionId: id, requestId: request.current.id, providerId: service.id, quote: service.quote, draftPrompt: prompt, prompt: fullPrompt });
      if (result.success) request.current = null;
      const next = await loadAssetStudio(roomId, kind, id);
      setState(next);
      setSelectedId(current => next.assets.some(a => a.id === current) ? current : next.assets[0]?.id ?? '');
      return result;
    } finally { mutating.current = false; }
  }, { fallbackError: t('error') });
  const remove = useAsyncAction(async () => {
    if (!deleteId || mutating.current) return;
    mutating.current = true; readVersion.current++;
    let result;
    try { result = await deleteAssetCandidate(roomId, deleteId); }
    finally { mutating.current = false; }
    if (result.success) { setConfirm(null); await refresh(); }
    return result;
  }, { fallbackError: t('error') });
  const apply = useAsyncAction(async (close: () => void) => {
    if (!selected) return;
    if (kind !== 'portrait') { onSelect?.(selected.url); close(); return; }
    const response = await fetch(selected.url);
    if (!response.ok) return { success: false as const, error: t('error') };
    const file = new File([await response.blob()], 'portrait.webp', { type: 'image/webp' });
    closeAfterCrop.current = close;
    setCrop({ asset: selected, file });
  }, { fallbackError: t('error') });
  const purposes = kind === 'portrait' || kind === 'character' ? [kind, 'headshot'] : kind === 'clue' ? ['clue', 'document', 'scene'] : ['item', 'scene'];
  const options = (keys: string[]) => keys.map(id => ({ id, label: t(id), badge: { Icon: ImageIcon } }));
  const switchSession = async (id: string) => {
    readVersion.current++;
    liveSession.current = id === 'new' ? undefined : id;
    setSessionId(id === 'new' ? undefined : id);
    setSelectedId(''); request.current = null;
    setPrompt(id === 'new' ? initialPrompt : state?.sessions.find(s => s.id === id)?.prompt ?? '');
    setStyle('styles');
    // Hide old candidates immediately while the new session is loading.
    setState(s => s ? { ...s, assets: [], tasks: [] } : s);
  };
  return <>
    <OverlayShell portal ariaLabelledBy={titleId} onClose={onClose} layerClassName="z-[80]" rootClassName="p-2 sm:p-4" panelClassName="w-full max-w-5xl h-[90dvh] min-h-0 bg-surface text-text theme-border rounded-theme shadow-2xl overflow-hidden flex flex-col">
      {close => <div ref={panel} tabIndex={-1} aria-labelledby={titleId} className="flex flex-col min-h-0 h-full outline-none" data-testid="asset-studio">
        <header className="shrink-0 border-b border-border p-3 sm:p-5 flex items-start gap-3">
          <Sparkles className="text-ai shrink-0 mt-1" aria-hidden />
          <div className="min-w-0 flex-1"><h2 id={titleId} className="text-lg font-bold font-theme-display">{t('title')}</h2><p className="text-xs text-text-muted mt-1">{t('private')}</p></div>
          <button type="button" onClick={close} aria-label={t('close')} className={secondary}><X className="w-4 h-4" /></button>
        </header>
        <nav className="md:hidden shrink-0 flex gap-2 p-2 border-b border-border" aria-label={t('title')}>
          {['description', 'candidates'].map(id => <button type="button" key={id} aria-pressed={tab === id} onClick={() => setTab(id)} className={`flex-1 ${secondary} ${tab === id ? 'bg-primary/10 border-primary text-primary' : ''}`}>{t(id)}{id === 'candidates' ? ` (${state?.assets.length ?? 0})` : ''}</button>)}
        </nav>
        <div className="flex-1 min-h-0 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <section className={`${tab === 'description' ? 'block' : 'hidden'} md:block h-full overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4 md:border-r border-border min-w-0`}>
            {loadError && <Notice variant="error">{t('error')} <button type="button" className={secondary} onClick={() => void refresh()}>{t('retry')}</button></Notice>}
            {!state && !loadError && <p>{t('loading')}</p>}
            {state && !state.services.length && <Notice variant="info">{t('noService')}</Notice>}
            {(!!state?.services.length || !!service) && <div><label htmlFor={`${promptId}-service`} className="block text-sm mb-2">{t('service')}</label><BadgeDropdown id={`${promptId}-service`} headerText={t('service')} value={String(service?.id ?? '')} onChange={id => setService(state?.services.find(s => String(s.id) === id) ?? null)} items={[...(service && !currentService ? [{ id: String(service.id), label: service.name, description: t('unavailable'), disabled: true, badge: { Icon: Sparkles } }] : []), ...(state?.services ?? []).map(s => ({ id: String(s.id), label: s.name, description: s.shared ? `${t('shared')} · ${s.points}` : t('personal'), badge: { Icon: Sparkles } }))]} />
              {service && <p className="mt-2 text-xs text-text-muted break-words">{t('spec', { model: service.model, size: service.size })}</p>}</div>}
            {serviceChanged && <Notice variant="info">{t('quoteChanged')}{currentService && <button type="button" className={`${secondary} mt-2 w-full`} onClick={() => setService(currentService)}>{t('confirmRate', { points: currentService.points })}</button>}</Notice>}
            <div><label htmlFor={`${promptId}-recent`} className="block text-sm mb-2">{t('recent')}</label><BadgeDropdown id={`${promptId}-recent`} headerText={t('recent')} disabled={submit.pending || remove.pending || apply.pending} value={sessionId ?? 'new'} onChange={id => void switchSession(id)} items={[{ id: 'new', label: t('new'), badge: { Icon: Sparkles } }, ...(state?.sessions ?? []).map(s => ({ id: s.id, label: new Date(s.createdAt).toLocaleString(), description: s.prompt.slice(0, 80), badge: { Icon: ImageIcon } }))]} /></div>
            <div><p className="text-sm mb-2">{t('purpose')}</p><div className="flex flex-wrap gap-2">{purposes.map(p => <button type="button" key={p} aria-pressed={purpose === p} onClick={() => setPurpose(p)} className={`${secondary} ${purpose === p ? 'border-primary bg-primary/10 text-primary' : ''}`}>{t(p)}</button>)}</div></div>
            <div><label htmlFor={promptId} className="block text-sm mb-2">{t('prompt')}</label><textarea id={promptId} value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={7500} rows={7} className={`${field} resize-y`} placeholder={t('placeholder')} /><p className="text-xs text-text-muted mt-2">{t('promptHint')}</p><button type="button" className={`${secondary} mt-2`} onClick={() => setConfirm('replace')}>{t('refresh')}</button></div>
            <div><label htmlFor={`${promptId}-style`} className="block text-sm mb-2">{t('style')}</label><BadgeDropdown id={`${promptId}-style`} headerText={t('style')} value={style} onChange={setStyle} items={options(['styles', 'realistic', 'illustration', 'watercolor', 'pixel'])} /></div>
            {purpose === 'document' && <Notice variant="info">{t('documentHint')}</Notice>}
            <details className="text-sm"><summary className="cursor-pointer min-h-11 py-2 text-text-muted">{t('fullPrompt')}</summary><p className="whitespace-pre-wrap break-words p-3 bg-surface-alt rounded-theme">{fullPrompt}</p></details>
          </section>
          <section className={`${tab === 'candidates' ? 'block' : 'hidden'} md:block h-full overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4 min-w-0`} aria-label={t('candidates')}>
            <h3 className="font-semibold">{t('candidates')} · {state?.assets.length ?? 0}</h3>
            {!state?.assets.length && <div className="rounded-theme border border-dashed border-border min-h-48 p-6 flex items-center justify-center text-text-muted text-center">{t('empty')}</div>}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{state?.assets.map((asset, index) => <button type="button" key={asset.id} aria-label={`${t('candidates')} ${index + 1}`} aria-pressed={asset.id === selectedId} onClick={() => setSelectedId(asset.id)} className={`relative rounded-theme overflow-hidden border-2 ${asset.id === selectedId ? 'border-primary ring-2 ring-primary/30' : 'border-border'} focus-visible:ring-2 focus-visible:ring-primary`}>
              
              <img src={asset.url} alt="" className="aspect-square w-full object-contain bg-surface-alt" />{asset.id === selectedId && <span className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-1"><Check className="w-4 h-4" /></span>}
            </button>)}</div>
            {selected && <>
              
              <img src={selected.url} alt={t('selected')} className="w-full max-h-[42dvh] object-contain rounded-theme bg-surface-alt border border-border" />
              <p className="text-xs text-text-muted">{selected.retained ? t('retained') : t('expires', { date: new Date(selected.expiresAt).toLocaleDateString() })}</p>
              <div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setPreview(selected.url)}>{t('preview')}</button><button type="button" className={`${secondary} text-danger`} onClick={() => { setDeleteId(selected.id); setConfirm('delete'); }}>{t('delete')}</button></div>
              <details><summary className="text-sm text-text-muted cursor-pointer py-2 min-h-11">{t('imagePrompt')}</summary><p className="text-sm whitespace-pre-wrap break-words">{selected.prompt}</p></details>
            </>}
            <p className="text-xs text-text-muted">{t(kind === 'portrait' ? 'portraitHint' : 'draftHint')}</p>
          </section>
        </div>
        <footer className="shrink-0 border-t border-border p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2 bg-surface">
          <div aria-live="polite" className="text-xs text-text-muted">
            {active ? <p>{t(active.status === 'generated' ? 'pending' : active.status)} {active.status !== 'queued' && refreshedAt - Date.parse(active.createdAt) > 600000 ? t('unknown') : ''}</p> : state?.tasks[0] ? <p>{t(state.tasks[0].status)}</p> : null}
            {service && <p>{service.shared ? t('price', { points: service.points, balance: state?.balance ?? 0 }) : t('personal')}</p>}
          </div>
          {(submit.error || apply.error || remove.error) && <Notice variant="error">{submit.error || apply.error || remove.error}</Notice>}
          <div className="grid grid-cols-1 min-[390px]:grid-cols-2 gap-2 sm:flex sm:justify-end">
            <button type="button" className={primary.replace('bg-primary text-primary-foreground', 'bg-ai text-ai-foreground')} disabled={!service || serviceChanged || !prompt.trim() || !!active || submit.pending || fullPrompt.length > 8000} onClick={() => void submit.run()}>{submit.pending ? t('loading') : t(state?.assets.length ? 'again' : 'generate')}</button>
            <button type="button" className={primary} disabled={!selected || apply.pending} onClick={() => void apply.run(close)}>{t(kind === 'portrait' ? 'crop' : 'use')}</button>
          </div>
        </footer>
      </div>}
    </OverlayShell>
    {confirm && <ConfirmDialog title={t(confirm === 'replace' ? 'replace' : 'delete')} description={t(confirm === 'replace' ? 'replaceBody' : 'deleteBody')} confirmLabel={t(confirm === 'replace' ? 'refresh' : 'delete')} tone={confirm === 'replace' ? 'primary' : 'danger'} layerClassName="z-[100]" busy={remove.pending} onCancel={() => setConfirm(null)} onConfirm={() => { if (confirm === 'replace') { setPrompt(initialPrompt); setConfirm(null); } else void remove.run(); }} />}
    {preview && <OverlayShell portal onClose={() => setPreview(null)} layerClassName="z-[100]" rootClassName="p-3" panelClassName="bg-surface rounded-theme theme-border w-full max-w-4xl max-h-[92dvh] p-3 flex flex-col gap-3">{close => <><button type="button" className={`${secondary} self-end shrink-0`} onClick={close}>{t('close')}</button><img src={preview} alt={t('preview')} className="min-h-0 object-contain" /></>}</OverlayShell>}
    {crop && <ImageCropper file={crop.file} aspectRatio={1} maxOutputSize={512} maxOutputBytes={280000} title={t('savePortrait')} confirmLabel={t('savePortrait')} layerClassName="z-[100]" onCancel={() => setCrop(null)} onConfirm={async data => { const result = await saveGeneratedPortrait(roomId, crop.asset.id, data).catch(() => ({ success: false as const, error: t('error') })); if (!result.success) throw new Error(result.error); setCrop(null); router.refresh(); closeAfterCrop.current?.(); }} />}
  </>;
}
