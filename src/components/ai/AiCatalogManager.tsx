'use client';
import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Server, Cpu } from 'lucide-react';
import { getAiCatalog, deleteAiVendor, testAiModel } from '@/app/actions/ai-catalog';
import { deleteProvider } from '@/app/actions/ai-providers';
import { useAsyncAction } from '@/lib/ui/useAsyncAction';
import { Notice } from '@/components/shared/Notice';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { parseProtocolConfig } from '@/lib/ai/protocol/config';
import { PROTOCOL_LABELS } from '@/lib/ai/vendor-config';
import { Action } from './ConfigControls';
import { VendorEditor } from './VendorEditor';
import { ModelEditor } from './ModelEditor';
type Catalog = Awaited<ReturnType<typeof getAiCatalog>>;
export function AiCatalogManager() {
  const t = useTranslations('aiCatalog');
  const [catalog, setCatalog] = useState<Catalog>();
  const [loadError, setLoadError] = useState(false);
  const [editVendor, setEditVendor] = useState<number | 'new' | null>(null);
  const [editModel, setEditModel] = useState<{ vendorId: number; id?: number }>();
  const [remove, setRemove] = useState<{ kind: 'vendor' | 'model'; id: number; name: string }>();
  const [testSuccess, setTestSuccess] = useState<number>();
  const load = useCallback(async () => { try { setCatalog(await getAiCatalog()); setLoadError(false); } catch { setLoadError(true); } }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const deletion = useAsyncAction(async () => {
    if (!remove) return;
    const result = remove.kind === 'vendor' ? await deleteAiVendor(remove.id) : await deleteProvider(remove.id);
    if (result.success) { setRemove(undefined); await load(); } return result;
  }, { fallbackError: t('saveFailed') });
  const test = useAsyncAction(async (id: number) => {
    setTestSuccess(undefined); const result = await testAiModel(id);
    if (result.success) setTestSuccess(id); return result;
  }, { fallbackError: t('testFailed') });
  const modelRow = (m: Catalog['models'][number]) => {
    const config = parseProtocolConfig(m.protocolConfig);
    return <div key={m.id} className="flex flex-wrap items-center gap-3 border-t border-border p-4">
      <Cpu className="h-4 w-4 shrink-0 text-ai" /><div className="min-w-0 flex-1"><p className="break-words font-medium text-text">{m.name}</p><p className="break-all text-xs font-theme-mono text-text-muted">{m.model}</p><div className="mt-1 flex flex-wrap gap-1.5 text-xs text-text-dim"><span>{PROTOCOL_LABELS[config.protocol]}</span>{config.reasoning?.effort && <span>· {config.reasoning.effort}</span>}{config.stream === true && <span>· {t('stream')}</span>}{config.multimodalInput === true && <span>· {t('multimodal')}</span>}{m.isShared && <span className="text-accent">· {t('sharedBadge')}</span>}</div></div>
      {m.isOwner && m.vendorId && <div className="flex flex-wrap gap-2"><Action disabled={test.pending} onClick={() => void test.run(m.id)}>{t('test')}</Action><Action onClick={() => setEditModel({ vendorId: m.vendorId!, id: m.id })}>{t('edit')}</Action><Action onClick={() => setRemove({ kind: 'model', id: m.id, name: m.name })}>{t('delete')}</Action></div>}
      {testSuccess === m.id && <p className="w-full text-xs text-success">{t('testSuccess')}</p>}
    </div>;
  };
  const selectedVendor = catalog?.vendors.find(v => v.id === editModel?.vendorId);
  return <section className="space-y-4 rounded-theme border border-border bg-surface p-4 font-theme theme-border sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-theme-display text-lg font-bold text-text">{t('title')}</h3><p className="mt-1 text-sm text-text-muted">{t('intro')}</p></div><Action primary onClick={() => setEditVendor('new')}><Plus className="h-4 w-4" />{t('addVendor')}</Action></div>
    {loadError ? <Notice variant="error">{t('loadFailed')} <Action onClick={() => void load()}>{t('retry')}</Action></Notice> : !catalog ? <p className="text-sm text-text-dim">{t('loading')}</p> : <>
      {!catalog.vendors.length && <p className="rounded-theme border border-dashed border-border p-6 text-center text-sm text-text-dim">{t('empty')}</p>}
      {catalog.vendors.map(v => { const models = catalog.models.filter(m => m.isOwner && m.vendorId === v.id); return <article key={v.id} className="overflow-hidden rounded-theme border border-border">
        <div className="flex flex-wrap items-center gap-3 bg-surface-alt/60 p-4"><Server className="h-5 w-5 text-accent" /><div className="min-w-0 flex-1"><h4 className="break-words font-bold text-text">{v.name}</h4><p className="break-words text-xs text-text-muted">{v.routes.map(r => PROTOCOL_LABELS[r.protocol]).join(' · ')} · {t('modelCount', { count: models.length })}</p></div><div className="flex flex-wrap gap-2"><Action onClick={() => setEditModel({ vendorId: v.id })}><Plus className="h-4 w-4" />{t('addModel')}</Action><Action onClick={() => setEditVendor(v.id)}>{t('editVendor')}</Action><Action disabled={models.length > 0} title={models.length > 0 ? t('vendorNotEmpty') : undefined} onClick={() => setRemove({ kind: 'vendor', id: v.id, name: v.name })}>{t('delete')}</Action></div></div>
        {models.length ? models.map(modelRow) : <p className="p-4 text-sm text-text-dim">{t('noModels')}</p>}
      </article>; })}
      {catalog.models.some(m => !m.isOwner) && <div className="rounded-theme border border-border"><h4 className="px-4 pt-4 font-bold text-text">{t('sharedModels')}</h4><p className="p-4 text-xs text-text-dim">{t('sharedReadOnly')}</p>{catalog.models.filter(m => !m.isOwner).map(modelRow)}</div>}
      {catalog.models.some(m => m.isOwner && !m.vendorId) && <Notice variant="error">{t('migrationRequired')}</Notice>}
    </>}
    {test.error && <Notice variant="error">{test.error}</Notice>}
    {deletion.error && <Notice variant="error">{deletion.error}</Notice>}
    {editVendor !== null && <VendorEditor key={editVendor} vendor={catalog?.vendors.find(v => v.id === editVendor)} used={catalog?.models.filter(m => m.vendorId === editVendor).map(m => parseProtocolConfig(m.protocolConfig).protocol) ?? []} onClose={() => setEditVendor(null)} onSaved={load} />}
    {editModel && selectedVendor && <ModelEditor key={`${editModel.vendorId}:${editModel.id ?? 'new'}`} vendor={selectedVendor} model={catalog?.models.find(m => m.id === editModel.id)} admin={catalog?.admin ?? false} onClose={() => setEditModel(undefined)} onSaved={load} />}
    {remove && <ConfirmDialog title={t('deleteTitle')} description={<>{t(remove.kind === 'model' ? 'deleteModelHint' : 'deleteVendorHint', { name: remove.name })}{deletion.error && <span role="alert" className="mt-2 block text-danger">{deletion.error}</span>}</>} confirmLabel={t('delete')} busy={deletion.pending} onConfirm={() => void deletion.run()} onCancel={() => { if (!deletion.pending) setRemove(undefined); }} />}
  </section>;
}
