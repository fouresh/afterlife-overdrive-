import type { Env } from './env';
import { error, json } from './http';

declare const __BUILD_SHA__: string | undefined;

export async function handleApi(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  if (path === '/api/health' && req.method === 'GET') {
    let db = 'ok';
    try {
      await env.DB.prepare('SELECT 1').first();
    } catch {
      db = 'unavailable';
    }
    return json({
      ok: true,
      env: env.ENVIRONMENT,
      build: typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev',
      db,
    });
  }
  return error(404, 'not_found');
}
