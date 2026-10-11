import { useEffect, useState } from 'preact/hooks';
import { flags } from '../core/flags';
import { applyUpdate, canInstall, onPwaChange, promptInstall, updateAvailable } from '../core/pwa';
import { t } from '../i18n';
import { kvGet } from '../state/db';

interface SaveSummary {
  characters?: { name: string; level: number; dead: boolean; hardcore: boolean }[];
}

export function MainMenu({ onPlay, onSettings }: { onPlay: () => void; onSettings: () => void }) {
  const [, force] = useState(0);
  const [summary, setSummary] = useState<SaveSummary | null>(null);
  useEffect(() => onPwaChange(() => force((n) => n + 1)), []);
  // Peek at the save without loading the game code (no validation needed for a label).
  useEffect(() => {
    void kvGet<SaveSummary>('save').then((s) => setSummary(s ?? null));
  }, []);
  const heroes = summary?.characters?.filter((c) => !c.dead) ?? [];
  return (
    <div class="screen menu" data-testid="main-menu">
      <h1 class="menu__title">
        AFTERLIFE <span>OVERDRIVE</span>
      </h1>
      <p class="menu__tag">{t('app.tagline')}</p>
      {heroes.length > 0 && (
        <div class="menu__profile" data-testid="profile-line">
          Героев: {heroes.length} ·{' '}
          {heroes.map((h) => `${h.hardcore ? '☠' : ''}${h.name} (${h.level})`).join(', ')}
        </div>
      )}
      {flags.room && (
        <div class="menu__invite" data-testid="invite-line">
          Вас пригласили в отряд {flags.room}: нажмите «Играть» и выберите героя.
        </div>
      )}
      <div class="menu__buttons">
        <button class="btn btn--primary" data-testid="btn-play" onClick={onPlay}>
          {t('menu.play')}
        </button>
        <button class="btn" data-testid="btn-settings" onClick={onSettings}>
          {t('menu.settings')}
        </button>
        {updateAvailable() && (
          <button class="btn" onClick={applyUpdate}>
            {t('menu.update')}
          </button>
        )}
        {canInstall() && (
          <button class="btn btn--ghost" onClick={() => void promptInstall()}>
            {t('menu.install')}
          </button>
        )}
      </div>
      <div class="menu__footer">
        {t('menu.version', { v: `${__APP_VERSION__} · ${__BUILD_SHA__}` })}
      </div>
    </div>
  );
}
