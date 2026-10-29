/** Resume queued image work when the self-hosted Node server starts. */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startImageWorker } = await import('./lib/ai/image/worker');
    startImageWorker();
  }
}
