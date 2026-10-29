'use client';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { OverlayShell } from '@/components/shared/OverlayShell';
import { Notice } from '@/components/shared/Notice';
import { saveAiVendor, type getAiCatalog } from '@/app/actions/ai-catalog';
import { useAsyncAction } from '@/lib/ui/useAsyncAction';
import { getVendor, vendorLabel, vendorOptions, COMPAT_VENDOR_ID } from '@/lib/ai/provider-presets';
import { PROTOCOLS, PROTOCOL_LABELS, presetRoutes, type VendorRoute } from '@/lib/ai/vendor-config';
import { Field, Choice, Toggle, Action } from './ConfigControls';
type Vendor = Awaited<ReturnType<typeof getAiCatalog>>['vendors'][number];
export function VendorEditor({ vendor, used, onClose, onSaved }: { vendor?: Vendor; used: string[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const t = useTranslations('aiCatalog');
  const c = useTranslations('common');
  const locale = useLocale();
  const [name, setName] = useState(vendor?.name ?? '');
  const [platform, setPlatform] = useState(vendor?.platform ?? COMPAT_VENDOR_ID);
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [routes, setRoutes] = useState<VendorRoute[]>(vendor?.routes ?? presetRoutes(COMPAT_VENDOR_ID));
  const save = useAsyncAction(async (close: () => void) => {
    const result = await saveAiVendor(vendor?.id ?? null, { name, platform, apiKey: key, routes });
    if (result.success) { await onSaved(); close(); }
    return result;
  }, { fallbackError: t('saveFailed'), keepPendingOnSuccess: true });
  const patch = (protocol: string, changes: Partial<VendorRoute>) => setRoutes(rs => rs.map(r => r.protocol === protocol ? { ...r, ...changes } : r));
  return <OverlayShell portal onClose={onClose} onDismiss={close => { if (!save.pending) close(); }} rootClassName="p-4" panelClassName="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-theme border border-border bg-surface theme-border p-5 font-theme shadow-2xl">
    {close => <div className="space-y-5">
      <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold font-theme-display text-text">{t(vendor ? 'editVendor' : 'addVendor')}</h3><Action onClick={close} disabled={save.pending}>{c('close')}</Action></div>
      <p className="text-sm text-text-muted">{t('vendorHint')}</p>
      <Choice label={t('platform')} value={platform} options={vendorOptions(vendor?.platform).map(v => ({ id: v.id, label: vendorLabel(v, locale) }))} onChange={value => { setPlatform(value); if (!vendor) { setName(value === COMPAT_VENDOR_ID ? '' : vendorLabel(getVendor(value)!, locale)); setRoutes(presetRoutes(value)); } }} />
      {getVendor(platform)?.hintKey && <p className="text-xs leading-5 text-text-muted">{t(getVendor(platform)!.hintKey!)}</p>}
      <Field label={t('vendorName')} value={name} maxLength={120} onChange={e => setName(e.target.value)} />
      <Field label={t('apiKey')} type={showKey ? 'text' : 'password'} autoComplete="new-password" value={key} onChange={e => setKey(e.target.value)} hint={vendor ? t('keepKey', { hint: vendor.keyHint ?? '' }) : undefined} trailing={
        <button type="button" aria-label={t(showKey ? 'hideKey' : 'showKey')} title={t(showKey ? 'hideKey' : 'showKey')} onClick={() => setShowKey(value => !value)} className="flex h-9 w-9 items-center justify-center rounded-theme text-text-muted transition-colors hover:bg-surface-alt hover:text-text outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {showKey ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      } />
      <div className="space-y-3"><h4 className="font-bold text-text">{t('routes')}</h4><p className="text-xs text-text-dim">{t('routeHint')}</p>
        {PROTOCOLS.map(protocol => { const route = routes.find(r => r.protocol === protocol); return <div key={protocol} className="space-y-3 rounded-theme border border-border bg-surface-alt/40 p-3">
          <Toggle label={PROTOCOL_LABELS[protocol]} checked={!!route} disabled={!!route && (used.includes(protocol) || routes.length === 1)} onChange={enabled => setRoutes(rs => enabled ? [...rs, { protocol, endpoint: '', endpointMode: 'base' }] : rs.filter(r => r.protocol !== protocol))} />
          {route && <><Field label={t('endpoint')} value={route.endpoint} placeholder="https://api.example.com/v1" onChange={e => patch(protocol, { endpoint: e.target.value })} />
            <div className="grid gap-3 sm:grid-cols-2"><Choice label={t('endpointMode')} value={route.endpointMode} options={['base', 'full'].map(id => ({ id, label: t(id) }))} onChange={v => patch(protocol, { endpointMode: v as VendorRoute['endpointMode'] })} />
            <Choice label={t('auth')} value={route.auth ?? 'auto'} options={['auto', 'bearer', 'api-key', 'google-key', 'none'].map(id => ({ id, label: id === 'auto' ? t('automatic') : id }))} onChange={v => patch(protocol, { auth: v === 'auto' ? undefined : v as VendorRoute['auth'] })} /></div>
            {used.includes(protocol) && <p className="text-xs text-text-dim">{t('routeUsed')}</p>}</>}
        </div>; })}
      </div>
      {save.error && <Notice variant="error">{save.error}</Notice>}
      <Action primary disabled={save.pending || !name.trim() || routes.some(r => !r.endpoint.trim())} onClick={() => void save.run(close)}>{t(save.pending ? 'saving' : 'save')}</Action>
    </div>}
  </OverlayShell>;
}
