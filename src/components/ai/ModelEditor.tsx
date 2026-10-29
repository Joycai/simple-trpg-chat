'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OverlayShell } from '@/components/shared/OverlayShell';
import { Notice } from '@/components/shared/Notice';
import { saveAiModel, fetchVendorModels, type getAiCatalog } from '@/app/actions/ai-catalog';
import { useAsyncAction } from '@/lib/ui/useAsyncAction';
import { parseProtocolConfig, type ProtocolConfig } from '@/lib/ai/protocol/config';
import { EFFORTS, PROTOCOL_LABELS, settingsForProtocol, selectReasoningEffort, setThinkingEnabled } from '@/lib/ai/vendor-config';
import type { Effort, Protocol } from '@/lib/ai/protocol/types';
import { Field, Choice, Toggle, Action } from './ConfigControls';
type Catalog = Awaited<ReturnType<typeof getAiCatalog>>;
type Model = Catalog['models'][number];
export function ModelEditor({ vendor, model, admin, onClose, onSaved }: { vendor: Catalog['vendors'][number]; model?: Model; admin: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations('aiCatalog'); const c = useTranslations('common');
  const initial = model ? parseProtocolConfig(model.protocolConfig) : { version: 1 as const, protocol: vendor.routes[0].protocol, endpointMode: 'base' as const };
  const [name, setName] = useState(model?.name ?? '');
  const [modelId, setModelId] = useState(model?.model ?? '');
  const [protocol, setProtocol] = useState<Protocol>(initial.protocol);
  const [settings, setSettings] = useState<Partial<Record<Protocol, ProtocolConfig>>>({ ...(model?.protocolSettings as Partial<Record<Protocol, ProtocolConfig>> ?? {}), [initial.protocol]: initial });
  const config = settingsForProtocol(settings, protocol);
  const patch = (value: Partial<ProtocolConfig>) => setSettings(s => ({ ...s, [protocol]: { ...settingsForProtocol(s, protocol), ...value } }));
  const [shared, setShared] = useState(model?.isShared ?? false);
  const [rates, setRates] = useState([model?.tokenRateInput ?? 0, model?.tokenRateCached ?? 0, model?.tokenRateOutput ?? 0].map(String));
  const [models, setModels] = useState<string[]>([]);
  const fetch = useAsyncAction(async () => {
    const result = await fetchVendorModels(vendor.id, protocol);
    if ('error' in result) return { success: false as const, error: result.error };
    setModels(result.models); return { success: true as const };
  }, { fallbackError: t('fetchFailed') });
  const save = useAsyncAction(async (close: () => void) => {
    const result = await saveAiModel(vendor.id, model?.id ?? null, { name, model: modelId, protocol, settings,
      isShared: admin && shared, tokenRateInput: admin ? Number(rates[0]) : 0, tokenRateCached: admin ? Number(rates[1]) : 0, tokenRateOutput: admin ? Number(rates[2]) : 0 });
    if (result.success) { await onSaved(); close(); } return result;
  }, { fallbackError: t('saveFailed'), keepPendingOnSuccess: true });
  const dialects = protocol === 'chat' ? ['auto', 'thinking', 'enable_thinking'] : protocol === 'responses' ? ['auto'] : protocol === 'messages' ? ['auto', 'adaptive', 'budget', 'thinking'] : ['auto', 'level', 'budget'];
  const dialect = config.capabilities?.thinkingDialect;
  const effort = config.reasoning?.effort;
  const number = (v: string) => v === '' ? undefined : Number(v);
  return <OverlayShell portal onClose={onClose} onDismiss={close => { if (!save.pending) close(); }} rootClassName="p-4" panelClassName="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-theme border border-border bg-surface theme-border p-5 font-theme shadow-2xl">
    {close => <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs text-accent">{vendor.name}</p><h3 className="text-lg font-bold font-theme-display text-text">{t(model ? 'editModel' : 'addModel')}</h3></div><Action onClick={close} disabled={save.pending}>{c('close')}</Action></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label={t('modelName')} value={name} onChange={e => setName(e.target.value)} /><Field label={t('modelId')} value={modelId} onChange={e => setModelId(e.target.value)} /></div>
      <Choice label={t('protocol')} value={protocol} options={vendor.routes.map(r => ({ id: r.protocol, label: PROTOCOL_LABELS[r.protocol] }))} onChange={p => { setProtocol(p as Protocol); setModels([]); }} disabled={save.pending || fetch.pending} />
      <p className="text-xs text-text-dim">{t('switchHint')}</p>
      <Action onClick={() => void fetch.run()} disabled={fetch.pending}>{t(fetch.pending ? 'fetching' : 'fetchModels')}</Action>
      {fetch.error && <Notice variant="error">{fetch.error}</Notice>}
      {models.length > 0 && <Choice label={t('availableModels')} value={models.includes(modelId) ? modelId : ''} options={[{ id: '', label: t('chooseModel') }, ...models.map(id => ({ id, label: id }))]} onChange={id => { if (id) { setModelId(id); if (!name) setName(id); } }} />}
      <div className="space-y-3 rounded-theme border border-border bg-surface-alt/40 p-4">
        <h4 className="font-bold text-text">{t('capabilities')}</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          <Choice label={t('stream')} value={config.stream === undefined ? 'auto' : String(config.stream)} options={['auto', 'true', 'false'].map(id => ({ id, label: t(id === 'auto' ? 'unspecified' : id === 'true' ? 'streamOn' : 'streamOff') }))} onChange={v => patch({ stream: v === 'auto' ? undefined : v === 'true' })} />
          <Choice label={t('multimodal')} value={config.multimodalInput === undefined ? 'auto' : String(config.multimodalInput)} options={['auto', 'true', 'false'].map(id => ({ id, label: t(id === 'auto' ? 'unspecified' : id === 'true' ? 'supported' : 'unsupported') }))} onChange={v => patch({ multimodalInput: v === 'auto' ? undefined : v === 'true' })} />
          <Field label={t('contextWindow')} inputMode="numeric" value={config.contextWindow ?? ''} placeholder={t('optional')} onChange={e => patch({ contextWindow: number(e.target.value) })} />
          <Field label={t('maxOutput')} inputMode="numeric" value={config.maxOutputTokens ?? ''} placeholder={t('optional')} onChange={e => patch({ maxOutputTokens: number(e.target.value) })} />
        </div><p className="text-xs leading-5 text-text-dim">{t('capabilityHint')}</p>
        {protocol === 'chat' && <Choice label={t('outputField')} value={config.outputTokenField ?? 'max_tokens'} options={['max_tokens', 'max_completion_tokens'].map(id => ({ id, label: id }))} onChange={v => patch({ outputTokenField: v as ProtocolConfig['outputTokenField'] })} />}
      </div>
      <div className="space-y-3 rounded-theme border border-border bg-surface-alt/40 p-4">
        <h4 className="font-bold text-text">{t('reasoning')}</h4>
        <p className="text-xs leading-5 text-text-dim">{t('effortHint')}</p>
        <Choice label={t('dialect')} value={dialect ?? 'auto'} options={dialects.map(id => ({ id, label: id === 'auto' ? t('unspecified') : id }))} onChange={v => patch({ reasoning: undefined, capabilities: { ...config.capabilities, thinkingDialect: v === 'auto' ? undefined : v as NonNullable<ProtocolConfig['capabilities']>['thinkingDialect'], effortMap: undefined } })} />
        <Choice label={t('effort')} value={effort ?? 'auto'} options={[{ id: 'auto', label: t('unspecified') }, ...EFFORTS.filter(e => dialect !== 'enable_thinking' || e === 'off').map(id => ({ id, label: id }))]} onChange={v => patch(selectReasoningEffort(config, v === 'auto' ? undefined : v as Effort))} />
        {dialect === 'budget' ? <Field label={t('budget')} inputMode="numeric" value={config.reasoning?.budgetTokens ?? (effort ? config.capabilities?.effortMap?.[effort] : undefined) ?? ''} onChange={e => {
          const value = number(e.target.value);
          if (effort) patch({ reasoning: { ...config.reasoning, budgetTokens: undefined }, capabilities: { ...config.capabilities, effortMap: { ...config.capabilities?.effortMap, [effort]: value } } });
          else patch({ reasoning: { ...config.reasoning, budgetTokens: value } });
        }} /> : effort && <Field label={t('wireEffort')} value={config.capabilities?.effortMap?.[effort] ?? ''} onChange={e => patch({ capabilities: { ...config.capabilities, effortMap: { ...config.capabilities?.effortMap, [effort]: e.target.value } } })} />}
        {dialect && dialect !== 'level' && protocol !== 'responses' && <Choice label={t('thinking')} value={config.reasoning?.enabled === undefined ? 'auto' : String(config.reasoning.enabled)} options={['auto', 'true', 'false'].map(id => ({ id, label: t(id === 'auto' ? 'unspecified' : id === 'true' ? 'enabled' : 'disabled') }))} onChange={v => patch(setThinkingEnabled(config, v === 'auto' ? undefined : v === 'true'))} />}

      </div>
      {admin && <div className="space-y-3 rounded-theme border border-border p-4"><Toggle label={t('shared')} checked={shared} onChange={setShared} /><p className="text-xs text-text-dim">{t('ratesHint')}</p><div className="grid gap-3 sm:grid-cols-3">{['rateInput', 'rateCached', 'rateOutput'].map((key, i) => <Field key={key} label={t(key)} inputMode="decimal" value={rates[i]} onChange={e => setRates(rs => rs.map((r, j) => i === j ? e.target.value : r))} />)}</div></div>}
      {save.error && <Notice variant="error">{save.error}</Notice>}
      <Action primary disabled={save.pending || !name.trim() || !modelId.trim()} onClick={() => void save.run(close)}>{t(save.pending ? 'saving' : 'save')}</Action>
    </div>}
  </OverlayShell>;
}
