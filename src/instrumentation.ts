/**
 * Next.js Instrumentation Hook
 *
 * Called once on server startup. Used here to initialize the database
 * adapter — reads system_config and potentially switches to PostgreSQL.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initDb } = await import('@/db');
    await initDb();
    console.log('[Instrumentation] Database adapter initialized');
  }
}
