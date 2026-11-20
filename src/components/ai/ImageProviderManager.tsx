'use client';
import { useCallback, useEffect, useState, useId } from 'react';
import { useTranslations } from 'next-intl';
import { IMAGE_MODELS, imageModel, imageSizes, type ImageProviderData, type ImageProviderView, type ImageProtocol } from '@/lib/ai/image/config';
import { getImageProviders, saveImageProvider, updateSharedImageProviderAdmin, deleteImageProvider, getMyImageUsage, getAdminImageUsage } from '@/app/actions/image-providers';
import { useAsyncAction } from '@/lib/ui/useAsyncAction';
import { Notice } from '@/components/shared/Notice';
import { BadgeDropdown } from '@/components/shared/BadgeDropdown';
import { OverlayShell } from '@/components/shared/OverlayShell';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Eye, EyeOff, Plus, Sparkles } from 'lucide-react';
import { Action, Field, Toggle } from './ConfigControls';

const initial = (): ImageProviderData => ({ name: '', modelType: IMAGE_MODELS[0].id, model: IMAGE_MODELS[0].model, protocol: 'openai-images', apiEndpoint: IMAGE_MODELS[0].endpoint, apiKey: '', size: '1024x1024', quality: 'auto', aspectRatio: '1:1', watermark: false, ratePerImage: 0, isShared: false });

type UsageRow = {
  id: string;
  createdAt: string;
  status: string;
  imageCount: number | null;
  points: number;
  userName?: string;
  providerName?: string;
};

function SharedImageProviderAdminDialog({ provider, onClose, onSaved }: { provider: ImageProviderView; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations('imageGeneration');
  const c = useTranslations('common');
  const [shared, setShared] = useState(provider.isShared);
  const [rateText, setRateText] = useState(String(provider.ratePerImage ?? 0));
  const save = useAsyncAction(async (close: () => void) => {
    const res = await updateSharedImageProviderAdmin(provider.id, { isShared: shared, ratePerImage: Number(rateText) });
    if (res.success) { await onSaved(); close(); }
    return res;
  }, { fallbackError: t('failed'), keepPendingOnSuccess: true });

  return <OverlayShell portal onClose={onClose} onDismiss={close => { if (!save.pending) close(); }} rootClassName="p-4" panelClassName="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-theme border border-border bg-surface theme-border p-5 font-theme shadow-2xl">
    {close => <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div><p className="text-xs font-theme-mono text-text-muted">{provider.model}</p><h3 className="text-lg font-bold font-theme-display text-text">{provider.name}</h3></div>
        <Action onClick={close} disabled={save.pending}>{c('close')}</Action>
      </div>
      <p className="text-xs leading-5 text-text-muted">{t('sharedAdminHint')}</p>
      <Toggle label={t('share')} checked={shared} onChange={setShared} disabled={save.pending} />
      <Field label={t('rate')} inputMode="decimal" required value={rateText} disabled={save.pending} onChange={e => setRateText(e.target.value)} />
      {save.error && <Notice variant="error">{save.error}</Notice>}
      <Action primary disabled={save.pending} onClick={() => void save.run(close)}>{save.pending ? t('saving') : t('save')}</Action>
    </div>}
  </OverlayShell>;
}

export function ImageProviderManager({ admin = false }: { admin?: boolean }) {
  const editorId = useId();
  const t = useTranslations('imageGeneration');
  const c = useTranslations('common');
  const [rows, setRows] = useState<ImageProviderView[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const [editingHint, setEditingHint] = useState('');
  const [managingShared, setManagingShared] = useState<ImageProviderView | null>(null);
  const [draft, setDraft] = useState(initial);
  const [rateText, setRateText] = useState('0');
  const [showKey, setShowKey] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const [providers, records] = await Promise.all([
        getImageProviders(),
        admin ? getAdminImageUsage() : getMyImageUsage(),
      ]);
      setRows(providers);
      setUsage(records);
    }
    catch { setLoadError(true); }
    finally { setLoading(false); }
  }, [admin]);
  // Initial read and explicit refresh share the same loading/error handling.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const save = useAsyncAction(async () => {
    const payload: ImageProviderData = {
      ...draft,
      ratePerImage: admin ? Number(rateText) : 0,
      isShared: admin ? draft.isShared : false,
    };
    const res = await saveImageProvider(editing ?? null, payload);
    if (res.success) {
      setEditing(undefined);
      await load();
    }
    return res;
  }, { fallbackError: t('failed') });
  const remove = useAsyncAction(async () => {
    const res = await deleteImageProvider(deleting!);
    if (res.success) {
      setDeleting(null);
      await load();
    }
    return res;
  }, { fallbackError: t('failed') });

  function selectType(id: string) {
    const model = imageModel(id)!;
    setDraft(d => ({ ...d, modelType: id, model: model.model, protocol: model.protocols[0], apiEndpoint: model.endpoint, size: model.sizes[0], quality: 'auto' }));
  }

  function openCreate() {
    save.clearError();
    setShowKey(false);
    setEditingHint('');
    setDraft({ ...initial(), isShared: admin });
    setRateText('0');
    setEditing(null);
  }

  function openEdit(row: ImageProviderView) {
    save.clearError();
    setShowKey(false);
    setEditingHint(row.apiKeyHint || '');
    setDraft({ ...row, apiKey: '' });
    setRateText(String(row.ratePerImage ?? 0));
    setEditing(row.id);
  }

  function openDelete(id: number) {
    remove.clearError();
    setDeleting(id);
  }

  return <section className="min-w-0 theme-border rounded-theme border border-border bg-surface p-4 sm:p-5 space-y-4 font-theme">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-theme-display text-lg font-bold text-text">{t('title')}</h2>
        <p className="mt-1 min-w-0 text-sm text-text-muted">{t('description')}</p>
      </div>
      <Action primary disabled={editing !== undefined} onClick={openCreate}><Plus className="h-4 w-4" />{t('add')}</Action>
    </div>
    {loadError && <Notice variant="error">{t('loadFailed')} <Action onClick={() => void load()}>{t('retry')}</Action></Notice>}
    {loading && <p className="text-sm text-text-dim">{t('loading')}</p>}
    {!loading && !loadError && rows.length === 0 && <p className="rounded-theme border border-dashed border-border p-6 text-center text-sm text-text-dim">{t('empty')}</p>}
    {rows.map(row => <div key={row.id} className="flex flex-wrap items-center gap-3 border-b border-border py-3">
      <div className="min-w-0 flex-1">
        <p className="text-text font-medium break-words">
          {row.name} <span className={`ml-1 text-xs ${row.isShared ? 'text-accent' : 'text-text-dim'}`}>· {row.isShared ? t('shared') : t('private')}</span>
        </p>
        <p className="text-xs font-theme-mono text-text-muted break-all">
          {row.model} · {row.size}{(row.isShared || row.ratePerImage > 0) ? ` · ${t('rateValue', { rate: row.ratePerImage })}` : ''}
        </p>
      </div>
      {row.isOwner ? (
        <div className="flex flex-wrap gap-2">
          <Action disabled={editing !== undefined} onClick={() => openEdit(row)}>{t('edit')}</Action>
          <Action disabled={editing !== undefined} onClick={() => openDelete(row.id)}>{t('delete')}</Action>
        </div>
      ) : (row.canManage && admin) ? (
        <div className="flex flex-wrap gap-2">
          <Action disabled={editing !== undefined} onClick={() => setManagingShared(row)}>{t('manageShared')}</Action>
          <Action disabled={editing !== undefined} onClick={() => openDelete(row.id)}>{t('delete')}</Action>
        </div>
      ) : null}
    </div>)}

    {editing !== undefined && <form className="grid gap-3 rounded-theme border border-border bg-surface-alt/40 p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); void save.run(); }}>
      <fieldset disabled={save.pending} className="contents">
        <Field label={t('name')} required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${editorId}-type`} className="text-xs font-medium text-text-muted">{t('type')}</label>
          <BadgeDropdown id={`${editorId}-type`} value={draft.modelType} onChange={selectType} headerText={t('type')} disabled={save.pending} items={IMAGE_MODELS.map(m => ({ id: m.id, label: m.label, badge: { Icon: Sparkles } }))} />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${editorId}-protocol`} className="text-xs font-medium text-text-muted">{t('protocol')}</label>
          <BadgeDropdown id={`${editorId}-protocol`} value={draft.protocol} onChange={value => { const protocol = value as ImageProtocol; setDraft({ ...draft, protocol, size: imageSizes(draft.modelType, protocol)[0] }); }} headerText={t('protocol')} disabled={save.pending} items={imageModel(draft.modelType)!.protocols.map(p => ({ id: p, label: t(`protocols.${p}`), badge: { Icon: Sparkles } }))} />
        </div>
        <Field label={t('model')} required value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} />
        <p className="sm:col-span-2 text-xs leading-5 text-text-dim">{t('gatewayHint')}</p>
        <Field label={t('endpoint')} type="url" required value={draft.apiEndpoint} onChange={e => setDraft({ ...draft, apiEndpoint: e.target.value })} />
        <Field
          label={editing ? t('keyKeep') : t('key')}
          hint={editing && editingHint ? t('keyHintEnding', { hint: editingHint }) : undefined}
          type={showKey ? 'text' : 'password'}
          autoComplete="new-password"
          required={editing === null}
          value={draft.apiKey ?? ''}
          onChange={e => setDraft({ ...draft, apiKey: e.target.value })}
          trailing={
            <button type="button" aria-label={t(showKey ? 'hideKey' : 'showKey')} title={t(showKey ? 'hideKey' : 'showKey')} onClick={() => setShowKey(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-theme text-text-muted transition-colors hover:bg-surface-alt hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer">
              {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          }
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${editorId}-size`} className="text-xs font-medium text-text-muted">{t('size')}</label>
          <BadgeDropdown id={`${editorId}-size`} value={draft.size} onChange={value => setDraft({ ...draft, size: value })} headerText={t('size')} disabled={save.pending} items={imageSizes(draft.modelType, draft.protocol).map(size => ({ id: size, label: size, badge: { Icon: Sparkles } }))} />
        </div>
        {admin && <Field label={t('rate')} inputMode="decimal" required value={rateText} onChange={e => setRateText(e.target.value)} />}
        {draft.protocol === 'openai-images' && <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor={`${editorId}-quality`} className="text-xs font-medium text-text-muted">{t('quality')}</label><BadgeDropdown id={`${editorId}-quality`} value={draft.quality ?? 'auto'} onChange={value => setDraft({ ...draft, quality: value as ImageProviderData['quality'] })} headerText={t('quality')} disabled={save.pending} items={(['auto', 'low', 'medium', 'high'] as const).map(q => ({ id: q, label: t(`qualities.${q}`), badge: { Icon: Sparkles } }))} /></div>}
        {draft.protocol === 'gemini' && <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor={`${editorId}-aspect`} className="text-xs font-medium text-text-muted">{t('aspect')}</label><BadgeDropdown id={`${editorId}-aspect`} value={draft.aspectRatio ?? '1:1'} onChange={value => setDraft({ ...draft, aspectRatio: value as ImageProviderData['aspectRatio'] })} headerText={t('aspect')} disabled={save.pending} items={['1:1', '16:9', '9:16', '4:3', '3:4'].map(a => ({ id: a, label: a, badge: { Icon: Sparkles } }))} /></div>}
        {(draft.protocol === 'seedream' || draft.protocol === 'dashscope') && <div className="sm:col-span-2"><Toggle label={t('watermark')} checked={draft.watermark} onChange={watermark => setDraft({ ...draft, watermark })} disabled={save.pending} /></div>}
        {admin && <div className="sm:col-span-2"><Toggle label={t('share')} checked={draft.isShared} onChange={isShared => setDraft({ ...draft, isShared })} disabled={save.pending} /></div>}
        <p className="sm:col-span-2 text-xs leading-5 text-text-dim">{t('billingHint')}</p>
        {save.error && <div className="sm:col-span-2"><Notice variant="error">{save.error}</Notice></div>}
        <div className="sm:col-span-2 flex flex-wrap items-center gap-2 pt-1">
          <Action type="submit" primary disabled={save.pending}>{save.pending ? t('saving') : t('save')}</Action>
          <Action disabled={save.pending} onClick={() => { save.clearError(); setEditing(undefined); }}>{c('cancel')}</Action>
        </div>
      </fieldset>
    </form>}

    {managingShared && <SharedImageProviderAdminDialog key={managingShared.id} provider={managingShared} onClose={() => setManagingShared(null)} onSaved={load} />}

    {deleting !== null && <ConfirmDialog
      title={t('delete')}
      description={<>{t('deleteHint')}{remove.error && <span role="alert" className="mt-2 block text-danger">{remove.error}</span>}</>}
      confirmLabel={t('delete')}
      busy={remove.pending}
      onConfirm={() => void remove.run()}
      onCancel={() => { if (!remove.pending) { remove.clearError(); setDeleting(null); } }}
    />}

    {usage.length > 0 && <details className="rounded-theme border border-border p-3"><summary className="cursor-pointer text-sm font-medium text-text">{t(admin ? 'usageAdmin' : 'usage')}</summary><div className="mt-2 overflow-x-auto"><table className="w-full text-left text-xs text-text-muted"><thead className="border-b border-border text-text-dim"><tr>{admin && <><th className="py-1.5 pr-3">{t('user')}</th><th className="py-1.5 pr-3">{t('service')}</th></>}<th className="py-1.5 pr-3">{t('time')}</th><th className="py-1.5 pr-3">{t('status')}</th><th className="py-1.5 pr-3">{t('count')}</th><th className="py-1.5">{t('points')}</th></tr></thead><tbody className="divide-y divide-border/50">{usage.map(u => <tr key={u.id}>{admin && <><td className="py-1.5 pr-3 text-text">{u.userName}</td><td className="py-1.5 pr-3">{u.providerName}</td></>}<td className="py-1.5 pr-3 whitespace-nowrap">{new Date(u.createdAt).toLocaleString()}</td><td className="py-1.5 pr-3">{t(`statuses.${['queued', 'generated'].includes(u.status) ? 'pending' : u.status}`)}</td><td className="py-1.5 pr-3">{u.imageCount ?? '—'}</td><td className="py-1.5">{u.points}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
