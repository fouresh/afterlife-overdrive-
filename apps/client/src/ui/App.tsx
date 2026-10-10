import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { diagSet } from '../core/diagnostics';
import { showFatalError } from '../core/errors';
import { flags, isTouchDevice } from '../core/flags';
import { enterImmersive } from '../core/viewport';
import { t } from '../i18n';
import { MainMenu } from './MainMenu';

type Screen = 'menu' | 'game';
type GameScreenType = ComponentType<{ onExit: () => void }>;

/** Top-level screen router. Heavy screens (Pixi game) are code-split and loaded on demand. */
export function App() {
  const [screen, setScreen] = useState<Screen>(flags.autostart ? 'game' : 'menu');
  const [Game, setGame] = useState<GameScreenType | null>(null);

  useEffect(() => {
    diagSet('screen', screen);
    window.__AO__ = { ...window.__AO__, screen };
    if (screen === 'game' && !Game) {
      import('./GameScreen')
        .then((m) => setGame(() => m.default))
        .catch((err: unknown) =>
          showFatalError(err instanceof Error ? err : new Error(String(err))),
        );
    }
  }, [screen, Game]);

  // Warm the game chunk while the player looks at the menu.
  useEffect(() => {
    const id = setTimeout(() => void import('./GameScreen').catch(() => undefined), 1500);
    return () => clearTimeout(id);
  }, []);

  if (screen === 'menu') {
    return (
      <MainMenu
        onPlay={() => {
          if (isTouchDevice) void enterImmersive();
          setScreen('game');
        }}
      />
    );
  }
  if (!Game) return <div class="screen">{t('loading')}</div>;
  return <Game onExit={() => setScreen('menu')} />;
}
