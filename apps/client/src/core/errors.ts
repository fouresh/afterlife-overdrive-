import { buildReport, diagLog } from './diagnostics';

/**
 * Fatal error screen. Plain DOM (no Preact) so it works even if the UI framework itself broke.
 * Shows the error and a "copy report" button: the report goes into a Claude session for debugging.
 */
let shown = false;
const listeners: (() => void)[] = [];

/** Called when the error screen opens (e.g. to stop the game loop). */
export function onFatalError(fn: () => void): void {
  listeners.push(fn);
}

export function installErrorHandlers(): void {
  window.addEventListener('error', (ev) => {
    // Resource load errors (img/script) have no ev.error; ignore those that are not scripts.
    const err = ev.error as Error | undefined;
    if (!err && !ev.message) return;
    showFatalError(err ?? new Error(ev.message));
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const reason: unknown = ev.reason;
    showFatalError(reason instanceof Error ? reason : new Error(String(reason)));
  });
  // A deploy replaced the hashed chunks while this page was open: reload once.
  window.addEventListener('vite:preloadError', (ev) => {
    ev.preventDefault();
    if (!sessionStorage.getItem('ao-reloaded')) {
      sessionStorage.setItem('ao-reloaded', '1');
      location.reload();
    }
  });
}

export function showFatalError(err: Error): void {
  diagLog('fatal', err);
  console.error(err);
  if (shown) return;
  shown = true;
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
  const report = buildReport({ message: `${err.name}: ${err.message}`, stack: err.stack });
  const root = document.createElement('div');
  root.className = 'fatal';
  root.setAttribute('role', 'alertdialog');
  root.innerHTML = `
    <div class="fatal__box">
      <h1 class="fatal__title">Что-то пошло не так</h1>
      <p class="fatal__msg"></p>
      <p class="fatal__hint">Нажмите «Скопировать отчёт» и вставьте его в сессию Claude.</p>
      <textarea class="fatal__report" readonly></textarea>
      <div class="fatal__actions">
        <button class="btn btn--primary" data-act="copy">Скопировать отчёт</button>
        <button class="btn" data-act="reload">Перезагрузить</button>
      </div>
    </div>`;
  root.querySelector('.fatal__msg')!.textContent = err.message || String(err);
  const ta = root.querySelector('textarea')!;
  ta.value = report;
  root.querySelector('[data-act="copy"]')!.addEventListener('click', (ev) => {
    const btn = ev.currentTarget as HTMLButtonElement;
    void copyText(report, ta).then((ok) => {
      btn.textContent = ok ? 'Скопировано ✓' : 'Выделите текст вручную';
    });
  });
  root.querySelector('[data-act="reload"]')!.addEventListener('click', () => location.reload());
  document.body.appendChild(root);
}

export async function copyText(text: string, fallback?: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    fallback.focus();
    fallback.select();
    fallback.setSelectionRange(0, text.length);
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}
