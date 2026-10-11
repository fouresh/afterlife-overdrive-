import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { diagSet } from '../core/diagnostics';
import { showFatalError } from '../core/errors';
import { flags, isTouchDevice } from '../core/flags';
import { enterImmersive } from '../core/viewport';
import { t } from '../i18n';
import { MainMenu } from './MainMenu';

type Screen = 'menu' | 'game' | 'settings';
type Lazy = ComponentType<{ onExit: () => void; onBack: () => void }>;

const loaders: Record<'game' | 'settings', () => Promise<{ default: unknown }>> = {
  game: () => import('./game/GameRoot'),
  settings: () => import('./game/Settings'),
};

/** Top-level screen router. Heavy screens (Pixi game, saves) are code-split and loaded on demand. */
export function App() {
  const [screen, setScreen] = useState<Screen>(flags.autostart ? 'game' : 'menu');
  const [mods, setMods] = useState<Partial<Record<Screen, Lazy>>>({});

  useEffect(() => {
    diagSet('screen', screen);
    window.__AO__ = { ...window.__AO__, screen };
    if (screen !== 'menu' && !mods[screen]) {
      loaders[screen]()
        .then((m) => setMods((x) => ({ ...x, [screen]: m.default as Lazy })))
        .catch((err: unknown) =>
          showFatalError(err instanceof Error ? err : new Error(String(err))),
        );
    }
  }, [screen, mods]);

  // Warm the game chunk while the player looks at the menu.
  useEffect(() => {
    const id = setTimeout(() => void loaders.game().catch(() => undefined), 1500);
    return () => clearTimeout(id);
  }, []);

  if (screen === 'menu') {
    return (
      <MainMenu
        onPlay={() => {
          if (isTouchDevice) void enterImmersive();
          setScreen('game');
        }}
        onSettings={() => setScreen('settings')}
      />
    );
  }
  const Mod = mods[screen];
  if (!Mod) return <div class="screen">{t('loading')}</div>;
  return <Mod onExit={() => setScreen('menu')} onBack={() => setScreen('menu')} />;
}
