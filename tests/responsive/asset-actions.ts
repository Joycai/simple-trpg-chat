import type { StudioState } from '../../src/lib/ai/assets/types';
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240"><rect width="160" height="240" fill="#64748b"/><circle cx="80" cy="70" r="30" fill="#cbd5e1"/><path d="M30 230V150Q80 100 130 150V230" fill="#334155"/></svg>');
const state: StudioState = { services: [{ id: 1, name: '共享图片服务 Shared image service', model: 'test-image', size: '1024x1024', points: 2, shared: true, quote: 'quote' }], balance: 20, sessions: [], assets: [], tasks: [], portraitUrl: null };
let holdNext = false;
window.addEventListener('asset-test-control', event => {
  const action = (event as CustomEvent<string>).detail;
  if (action === 'price') { state.services[0].points = 7; state.services[0].quote = 'new-quote'; }
  if (action === 'remove') state.services = [{ ...state.services[0], id: 2, name: 'Other service' }];
  if (action === 'hold') holdNext = true;
});
export async function loadAssetStudio() {
  const snapshot = structuredClone(state);
  if (holdNext) {
    holdNext = false;
    document.documentElement.dataset.assetReadHeld = 'true';
    await new Promise<void>(resolve => window.addEventListener('asset-test-release', () => resolve(), { once: true }));
  }
  return snapshot;
}
export async function createAssetSession(_room: number, input: { prompt: string; targetKey: string }) {
  const id = crypto.randomUUID(); state.sessions.push({ id, ...input, createdAt: new Date().toISOString() }); return { success: true as const, id };
}
export async function submitAssetGeneration(_room: number, input: { prompt: string }) {
  state.assets.push({ id: crypto.randomUUID(), url: image, prompt: input.prompt, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), retained: false });
  state.balance -= 2;
  return { success: true as const };
}
export async function deleteAssetCandidate(_room: number, id: string) { state.assets = state.assets.filter(a => a.id !== id); return { success: true as const }; }
export async function saveGeneratedPortrait() { return { success: true as const }; }
