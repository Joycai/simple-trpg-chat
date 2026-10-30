'use client';
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { AiAssetStudio } from './AiAssetStudio';
import { loadAssetStudio } from '@/app/actions/asset-studio';
import type { AssetKind } from '@/lib/ai/assets/types';
import { OverlayShell } from '@/components/shared/OverlayShell';
export function AssetStudioEntry({ roomId, kind, targetKey, prompt, onSelect }: {
  roomId: number; kind: AssetKind; targetKey: string; prompt: string; onSelect?: (url: string) => void;
}) {
  const t = useTranslations('assetStudio');
  const [open, setOpen] = useState(false);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    if (kind !== 'portrait' || open) return;
    let live = true;
    void loadAssetStudio(roomId, kind).then(s => { if (live) setPortrait(s.portraitUrl); }).catch(() => {});
    return () => { live = false; };
  }, [roomId, kind, open]);
  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 inline-flex items-center gap-2 px-3 py-2 rounded-theme border border-ai/40 bg-ai/10 text-ai hover:bg-ai/20 focus-visible:ring-2 focus-visible:ring-ai text-sm"><Sparkles className="w-4 h-4 shrink-0" />{t(kind === 'portrait' ? 'portraitEntry' : 'entry')}</button>
      {portrait && <button type="button" className="min-h-11 px-3 py-2 rounded-theme border border-border text-text hover:bg-surface-alt text-sm" onClick={() => setPreview(true)}>{t('viewPortrait')}</button>}
    </div>
    <p className="text-xs text-text-muted">{t('resume')}</p>
    {open && <AiAssetStudio roomId={roomId} kind={kind} targetKey={targetKey} initialPrompt={prompt} onSelect={onSelect} onClose={() => setOpen(false)} />}
    {preview && portrait && <OverlayShell portal onClose={() => setPreview(false)} layerClassName="z-[80]" rootClassName="p-3" panelClassName="bg-surface rounded-theme theme-border w-full max-w-3xl max-h-[90dvh] p-3 flex flex-col gap-3">{close => <><button type="button" className="self-end shrink-0 min-h-11 px-3 py-2 rounded-theme border border-border text-text" onClick={close}>{t('close')}</button><img src={portrait} alt={t('viewPortrait')} className="min-h-0 object-contain" /></>}</OverlayShell>}
  </div>;
}
