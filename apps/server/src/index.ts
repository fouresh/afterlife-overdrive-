import { handleApi } from './api';
import type { Env } from './env';
import { error } from './http';

export { RoomDO } from './room';

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (err) {
        console.error('api error', err);
        return error(500, 'internal');
      }
    }
    // Static client (only reached for paths not matched by the assets router).
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
