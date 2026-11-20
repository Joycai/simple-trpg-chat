'use client';
import { AiCatalogManager } from '@/components/ai/AiCatalogManager';
import { ImageProviderManager } from '@/components/ai/ImageProviderManager';
export function AiProvidersTab({ userRole }: { userRole: string }) {
  const canUseLlmCatalog = userRole === 'host' || userRole === 'admin';
  return <div className="space-y-6">{canUseLlmCatalog && <AiCatalogManager />}<ImageProviderManager admin={userRole === 'admin'} /></div>;
}
