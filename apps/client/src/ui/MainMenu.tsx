import { useEffect, useState } from 'preact/hooks';
import { applyUpdate, canInstall, onPwaChange, promptInstall, updateAvailable } from '../core/pwa';
import { t } from '../i18n';
import { loadProfile } from '../state/profile';

export function MainMenu({ onPlay }: { onPlay: () => void }) {
  const [, force] = useState(0);
  useEffect(() => onPwaChange(() => force((n) => n + 1)), []);
  const profile = loadProfile();
  return (
    <div class="screen menu" data-testid="main-menu">
      <h1 class="menu__title">
        AFTERLIFE <span>OVERDRIVE</span>
      </h1>
      <p class="menu__tag">{t('app.tagline')}</p>
      {profile && (
        <div class="menu__profile" data-testid="profile-line">
          Забегов: {profile.runs} · побед: {profile.victories} · лучший этаж: {profile.bestDepth} ·
          золото: {profile.gold} · на складе: {profile.stash.length}
        </div>
      )}
      <div class="menu__buttons">
        <button class="btn btn--primary" data-testid="btn-play" onClick={onPlay}>
          {t('menu.play')}
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
