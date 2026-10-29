'use client';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IMAGE_MODELS, imageModel, imageSizes, type ImageProviderData, type ImageProviderView, type ImageProtocol } from '@/lib/ai/image/config';
import { getImageProviders, saveImageProvider, deleteImageProvider, getMyImageUsage } from '@/app/actions/image-providers';
import { useAsyncAction } from '@/lib/ui/useAsyncAction';
import { Notice } from '@/components/shared/Notice';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const initial = (): ImageProviderData => ({ name: '', modelType: IMAGE_MODELS[0].id, model: IMAGE_MODELS[0].model, protocol: 'openai-images', apiEndpoint: IMAGE_MODELS[0].endpoint, apiKey: '', size: '1024x1024', quality: 'auto', aspectRatio: '1:1', watermark: false, ratePerImage: 0, isShared: false });
const field = 'min-w-0 max-w-full w-full rounded-theme border border-input-border bg-input-bg px-3 py-2 text-text';
const button = 'rounded-theme border border-border px-3 py-2 text-sm text-text hover:bg-surface-alt disabled:opacity-50';
export function ImageProviderManager({ admin = false }: { admin?: boolean }) {
  const t = useTranslations('imageGeneration');
  const c = useTranslations('common');
  const [rows, setRows] = useState<ImageProviderView[]>([]);
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof getMyImageUsage>>>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [draft, setDraft] = useState(initial);
  const [deleting, setDeleting] = useState<number | null>(null);
  const load = useCallback(async () => {

    try { setLoadError(false); const [providers, records] = await Promise.all([getImageProviders(), getMyImageUsage()]); setRows(providers); setUsage(records); }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }, []);
  // Initial read and explicit refresh share the same loading/error handling.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const save = useAsyncAction(async () => saveImageProvider(editing ?? null, draft), { fallbackError: t('failed'), onSuccess: () => { setEditing(undefined); void load(); } });
  const remove = useAsyncAction(async () => deleteImageProvider(deleting!), { fallbackError: t('failed'), onSuccess: () => { setDeleting(null); void load(); } });
  function selectType(id: string) {
    const model = imageModel(id)!;
    setDraft(d => ({ ...d, modelType: id, model: model.model, protocol: model.protocols[0], apiEndpoint: model.endpoint, size: model.sizes[0], quality: 'auto' }));
  }
  return <section className="min-w-0 theme-border rounded-theme border border-border bg-surface p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold text-text">{t('title')}</h2>
      <button className={button} disabled={editing !== undefined} onClick={() => { setDraft({ ...initial(), isShared: admin }); setEditing(null); }}>{t('add')}</button></div>
    <p className="min-w-0 text-sm text-text-muted">{t('description')}</p>
    {loadError && <div><Notice variant="error">{t('loadFailed')}</Notice><button className={button} onClick={() => void load()}>{t('retry')}</button></div>}
    {loading && <p className="text-text-muted">{t('loading')}</p>}
    {!loading && !loadError && rows.length === 0 && <p className="text-text-muted">{t('empty')}</p>}
    {rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-3 border-b border-border py-2">
      <div className="min-w-0 flex-1"><p className="text-text font-medium break-words">{row.name} · {row.isShared ? t('shared') : t('private')}</p><p className="text-xs text-text-muted break-all">{row.model} · {row.size} · {t('rateValue', { rate: row.ratePerImage })}</p></div>
      {row.isOwner && <><button className={button} disabled={editing !== undefined} onClick={() => { setDraft({ ...row, apiKey: '' }); setEditing(row.id); }}>{t('edit')}</button><button className={button} disabled={editing !== undefined} onClick={() => setDeleting(row.id)}>{t('delete')}</button></>}
    </div>)}
    {editing !== undefined && <form className="grid gap-3 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save.run(); }}>
      <fieldset disabled={save.pending} className="contents">
      <label className="min-w-0 text-sm text-text-muted">{t('name')}<input required maxLength={100} className={field} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label className="min-w-0 text-sm text-text-muted">{t('type')}<select aria-label={t('type')} className={field} value={draft.modelType} onChange={e => selectType(e.target.value)}>{IMAGE_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
      <label className="min-w-0 text-sm text-text-muted">{t('protocol')}<select aria-label={t('protocol')} className={field} value={draft.protocol} onChange={e => { const protocol = e.target.value as ImageProtocol; setDraft({ ...draft, protocol, size: imageSizes(draft.modelType, protocol)[0] }); }}>{imageModel(draft.modelType)!.protocols.map(p => <option key={p} value={p}>{t(`protocols.${p}`)}</option>)}</select></label>
      <label className="min-w-0 text-sm text-text-muted">{t('model')}<input className={field} required value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} /></label>
      <p className="sm:col-span-2 text-xs text-text-muted">{t('gatewayHint')}</p>
      <label className="min-w-0 text-sm text-text-muted">{t('endpoint')}<input type="url" className={field} required value={draft.apiEndpoint} onChange={e => setDraft({ ...draft, apiEndpoint: e.target.value })} /></label>
      <label className="min-w-0 text-sm text-text-muted">{editing ? t('keyKeep') : t('key')}<input type="password" autoComplete="new-password" className={field} required={editing === null} value={draft.apiKey ?? ''} onChange={e => setDraft({ ...draft, apiKey: e.target.value })} /></label>
      <label className="min-w-0 text-sm text-text-muted">{t('size')}<select aria-label={t('size')} className={field} value={draft.size} onChange={e => setDraft({ ...draft, size: e.target.value })}>{imageSizes(draft.modelType, draft.protocol).map(size => <option key={size}>{size}</option>)}</select></label>
      <label className="min-w-0 text-sm text-text-muted">{t('rate')}<input type="number" min={0} max={1000000} step="0.000001" required className={field} value={draft.ratePerImage} onChange={e => setDraft({ ...draft, ratePerImage: Number(e.target.value) })} /></label>
      {draft.protocol === 'openai-images' && <label className="min-w-0 text-sm text-text-muted">{t('quality')}<select aria-label={t('quality')} className={field} value={draft.quality} onChange={e => setDraft({ ...draft, quality: e.target.value as ImageProviderData['quality'] })}>{(['auto', 'low', 'medium', 'high'] as const).map(q => <option key={q} value={q}>{t(`qualities.${q}`)}</option>)}</select></label>}
      {draft.protocol === 'gemini' && <label className="min-w-0 text-sm text-text-muted">{t('aspect')}<select aria-label={t('aspect')} className={field} value={draft.aspectRatio} onChange={e => setDraft({ ...draft, aspectRatio: e.target.value as ImageProviderData['aspectRatio'] })}>{['1:1', '16:9', '9:16', '4:3', '3:4'].map(a => <option key={a}>{a}</option>)}</select></label>}
      {(draft.protocol === 'seedream' || draft.protocol === 'dashscope') && <label className="text-sm text-text"><input className="accent-primary" type="checkbox" checked={draft.watermark} onChange={e => setDraft({ ...draft, watermark: e.target.checked })} /> {t('watermark')}</label>}
      {admin && <label className="text-sm text-text"><input className="accent-primary" type="checkbox" checked={draft.isShared} onChange={e => setDraft({ ...draft, isShared: e.target.checked })} /> {t('share')}</label>}
      <p className="sm:col-span-2 text-xs text-text-muted">{t('billingHint')}</p>
      <div className="sm:col-span-2 flex gap-2"><button type="submit" className={button}>{save.pending ? t('saving') : t('save')}</button><button type="button" className={button} onClick={() => setEditing(undefined)}>{c('cancel')}</button></div>
      </fieldset>
    </form>}
    {save.error && <Notice variant="error">{save.error}</Notice>}
    {remove.error && <Notice variant="error">{remove.error}</Notice>}
    {deleting !== null && <ConfirmDialog title={t('delete')} description={t('deleteHint')} confirmLabel={t('delete')} busy={remove.pending} onConfirm={() => void remove.run()} onCancel={() => setDeleting(null)} />}
    {usage.length > 0 && <details><summary className="cursor-pointer text-sm text-text">{t('usage')}</summary><div className="overflow-x-auto"><table className="w-full text-sm text-text-muted"><thead><tr><th>{t('time')}</th><th>{t('status')}</th><th>{t('count')}</th><th>{t('points')}</th></tr></thead><tbody>{usage.map(u => <tr key={u.id}><td>{new Date(u.createdAt).toLocaleString()}</td><td>{t(`statuses.${u.status === 'generated' ? 'pending' : u.status}`)}</td><td>{u.imageCount ?? '—'}</td><td>{u.points}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
