'use client';
import { AiCatalogManager } from '@/components/ai/AiCatalogManager';
import { ImageProviderManager } from '@/components/ai/ImageProviderManager';
export function AiProvidersTab() { return <div className="space-y-6"><AiCatalogManager /><ImageProviderManager /></div>; }
