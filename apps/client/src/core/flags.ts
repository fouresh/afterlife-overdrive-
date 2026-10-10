const params = new URLSearchParams(location.search);

/** URL flags. `?debug=1` shows the debug overlay; `?seed=123` forces a dungeon seed. */
export const flags = {
  debug: params.get('debug') === '1',
  e2e: params.get('e2e') === '1',
  seed: params.has('seed') ? Number(params.get('seed')) >>> 0 : undefined,
  room: params.get('room')?.toUpperCase() ?? undefined,
  /** Skip the main menu (used by tests/dev): ?autostart=1 */
  autostart: params.get('autostart') === '1',
};

export const isTouchDevice =
  typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
