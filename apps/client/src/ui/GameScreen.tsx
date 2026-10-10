import { useEffect, useRef, useState } from 'preact/hooks';
import { onFatalError, showFatalError } from '../core/errors';
import { flags, isTouchDevice } from '../core/flags';
import { readViewport } from '../core/viewport';
import { GameHost } from '../game/host';
import { t } from '../i18n';
import { DebugOverlay } from './DebugOverlay';
import { PixelIcon } from './PixelIcon';
import { TouchControls } from './TouchControls';

declare global {
  interface Window {
    /** Read-only hook for e2e tests and bug reports. */
    __AO__?: { screen: string; state?: () => unknown };
  }
}

export default function GameScreen({ onExit }: { onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<GameHost | null>(null);
  const [paused, setPaused] = useState(false);
  const [portrait, setPortrait] = useState(readViewport().portrait);

  useEffect(() => {
    const h = new GameHost(canvas.current!);
    let disposed = false;
    h.input.onPause = () => setPaused((p) => !p);
    h.start()
      .then(() => {
        if (disposed) return;
        setHost(h);
        window.__AO__ = { screen: 'game', state: () => h.debugState() };
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
    onFatalError(() => h.stop());
    return () => {
      disposed = true;
      h.destroy();
      window.__AO__ = { screen: 'menu' };
    };
  }, []);

  useEffect(() => {
    const check = () => setPortrait(readViewport().portrait);
    window.addEventListener('resize', check);
    const vis = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('resize', check);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  useEffect(() => {
    if (host) host.paused = paused || portrait;
  }, [host, paused, portrait]);

  const showTouch = isTouchDevice || navigator.maxTouchPoints > 0;

  return (
    <div class="game" data-testid="game">
      <canvas ref={canvas} />
      {host && showTouch && <TouchControls input={host.input} />}
      {host && !showTouch && (
        <div class="kbd-hint">WASD — ходьба · мышь — прицел · ЛКМ — атака · Пробел — рывок</div>
      )}
      <div class="topbar">
        <button
          class="btn icon-btn"
          aria-label={t('controls.pause')}
          data-testid="btn-pause"
          onClick={() => setPaused(true)}
        >
          <PixelIcon name="pause" />
        </button>
      </div>
      {host && flags.debug && <DebugOverlay stats={host.stats} />}
      {paused && !portrait && (
        <div class="overlay">
          <div class="panel">
            <h2>{t('pause.title')}</h2>
            <button class="btn btn--primary" onClick={() => setPaused(false)}>
              {t('pause.resume')}
            </button>
            <button class="btn" onClick={onExit}>
              {t('pause.toMenu')}
            </button>
          </div>
        </div>
      )}
      {portrait && (
        <div class="overlay rotate">
          <PixelIcon name="phone" class="rotate__icon" />
          <h2>{t('rotate.title')}</h2>
          <div>{t('rotate.text')}</div>
        </div>
      )}
    </div>
  );
}
