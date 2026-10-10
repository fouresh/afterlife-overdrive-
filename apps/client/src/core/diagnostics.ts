/**
 * Everything needed for a useful bug report when there is no devtools: recent log lines, the
 * current seed/screen, device info. The error screen and the debug overlay read from here.
 */
const LOG_LIMIT = 60;
const logLines: string[] = [];
const values = new Map<string, string>();

export function diagSet(key: string, value: unknown): void {
  values.set(key, typeof value === 'string' ? value : JSON.stringify(value));
}

export function diagLog(level: string, ...args: unknown[]): void {
  const time = new Date().toISOString().slice(11, 23);
  const text = args
    .map((a) =>
      a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : safeJson(a),
    )
    .join(' ');
  logLines.push(`${time} [${level}] ${text}`.slice(0, 500));
  if (logLines.length > LOG_LIMIT) logLines.shift();
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Mirror console.warn/error into the diagnostics log. */
export function captureConsole(): void {
  /* eslint-disable no-console -- wrapping the console is the point here */
  for (const level of ['warn', 'error', 'info'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      diagLog(level, ...args);
      orig(...args);
    };
  }
  /* eslint-enable no-console */
}

export function deviceInfo(): Record<string, string> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    ua: navigator.userAgent,
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: String(devicePixelRatio),
    lang: navigator.language,
    cores: String(navigator.hardwareConcurrency ?? '?'),
    memory: String(nav.deviceMemory ?? '?'),
    standalone: String(
      matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches,
    ),
    online: String(navigator.onLine),
  };
}

export function buildReport(error?: { message: string; stack?: string }): string {
  const lines: string[] = [];
  lines.push('=== Afterlife Overdrive — отчёт об ошибке ===');
  lines.push(`version: ${__APP_VERSION__} (${__BUILD_SHA__}, ${__BUILD_TIME__})`);
  lines.push(`time: ${new Date().toISOString()}`);
  lines.push(`url: ${location.href}`);
  if (error) {
    lines.push('', `error: ${error.message}`);
    if (error.stack) lines.push(error.stack);
  }
  lines.push('', '--- state ---');
  for (const [k, v] of values) lines.push(`${k}: ${v}`);
  lines.push('', '--- device ---');
  for (const [k, v] of Object.entries(deviceInfo())) lines.push(`${k}: ${v}`);
  lines.push('', '--- log ---');
  lines.push(...logLines);
  return lines.join('\n');
}
