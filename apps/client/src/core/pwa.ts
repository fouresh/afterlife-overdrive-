/** Service worker registration + "update available" signal + install prompt (Android). */
type Listener = () => void;

let waiting: ServiceWorker | null = null;
let installEvent: (Event & { prompt: () => Promise<void> }) | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const l of listeners) l();
}

export function onPwaChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function updateAvailable(): boolean {
  return waiting !== null;
}

export function canInstall(): boolean {
  return installEvent !== null;
}

export async function promptInstall(): Promise<void> {
  const ev = installEvent;
  installEvent = null;
  emit();
  await ev?.prompt();
}

export function applyUpdate(): void {
  if (!waiting) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  waiting.postMessage('skipWaiting');
}

export function registerServiceWorker(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as typeof installEvent;
    emit();
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const track = (sw: ServiceWorker | null) => {
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              waiting = sw;
              emit();
            }
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) {
          waiting = reg.waiting;
          emit();
        }
        track(reg.installing);
        reg.addEventListener('updatefound', () => track(reg.installing));
        // Check for a new deploy when the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (!document.hidden) void reg.update().catch(() => undefined);
        });
      })
      .catch((err: unknown) => console.warn('SW registration failed', err));
  });
}
