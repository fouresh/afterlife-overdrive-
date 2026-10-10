import type { Outcome, PlayerSetup, RunConfig } from '@ao/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../audio/sfx';
import { onFatalError, showFatalError } from '../core/errors';
import { flags, isTouchDevice } from '../core/flags';
import { readViewport } from '../core/viewport';
import type { Atlas } from '../game/atlas';
import { GameHost, getAtlas } from '../game/host';
import { t } from '../i18n';
import { newProfile } from '../state/newProfile';
import {
  STASH_LIMIT,
  cloneLoadout,
  loadProfile,
  saveProfile,
  type ProfileV1,
} from '../state/profile';
import { DebugOverlay } from './DebugOverlay';
import { Hud } from './hud/Hud';
import { PixelIcon } from './PixelIcon';
import { FloorChoice, RunSummary, type RunStats } from './screens/RunEnd';
import { Inventory } from './screens/Inventory';
import { WeaponPick } from './screens/WeaponPick';
import { DesktopBar, TouchControls } from './TouchControls';

declare global {
  interface Window {
    /** Read-only hook for e2e tests and bug reports. */
    __AO__?: {
      screen: string;
      state?: () => unknown;
      enterCombat?: () => boolean;
      grant?: () => void;
      finishFloor?: () => void;
    };
  }
}

type Phase = 'loading' | 'pick' | 'playing';
type Overlay =
  | null
  | 'pause'
  | 'inventory'
  | 'floor'
  | { summary: 'victory' | 'left' | 'dead'; stats: RunStats };

function runStats(host: GameHost): RunStats {
  const c = host.carry()[0]!;
  return {
    gold: c.gold ?? 0,
    kills: c.kills ?? 0,
    items: [
      ...(c.bag ?? []),
      ...[
        c.loadout?.weapon,
        c.loadout?.helmet,
        c.loadout?.chest,
        c.loadout?.boots,
        ...(c.loadout?.artifacts ?? []),
      ].filter((x) => x && !x.uid.startsWith('starter-') && !host.startUids.has(x.uid)),
    ].filter((x): x is NonNullable<typeof x> => !!x),
    depth: host.world.depth,
    floors: host.world.floors,
    seconds: host.world.ticksPlayed / 30 + host.elapsedBefore,
  };
}

/** One run: weapon pick (first time) → floors → between-floor choice → summary. */
export default function GameScreen({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [profile, setProfile] = useState<ProfileV1 | null>(() => loadProfile());

  useEffect(() => {
    getAtlas()
      .then((a) => {
        setAtlas(a);
        setPhase(loadProfile() ? 'playing' : 'pick');
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
  }, []);

  if (phase === 'loading' || !atlas) return <div class="screen">{t('loading')}</div>;
  if (phase === 'pick')
    return (
      <WeaponPick
        atlas={atlas}
        onPick={(weapon, artifact) => {
          const p = newProfile(weapon, artifact);
          saveProfile(p);
          setProfile(p);
          setPhase('playing');
        }}
      />
    );
  return <Run profile={profile!} onExit={onExit} />;
}

function Run({ profile, onExit }: { profile: ProfileV1; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<GameHost | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [portrait, setPortrait] = useState(readViewport().portrait);
  const [toasts, setToasts] = useState<{ id: number; text: string; kind: string }[]>([]);
  const hurt = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay>(null);
  overlayRef.current = overlay;

  useEffect(() => {
    const cfg: RunConfig = {
      seed: flags.seed ?? (Math.random() * 2 ** 32) >>> 0,
      biome: 'crypt',
      floors: 3,
    };
    let toastId = 0;
    const h = new GameHost(canvas.current!, cfg, {
      onOutcome: (o: Outcome) => {
        if (o === 'exit') {
          h.paused = true;
          setOverlay('floor');
        } else if (o === 'victory') finish(h, 'victory');
        else if (o === 'dead') setTimeout(() => finish(h, 'dead'), 600);
      },
      toast: (text, kind = 'info') => {
        const id = ++toastId;
        setToasts((list) => [...list.slice(-2), { id, text, kind }]);
        setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 2200);
      },
      hurtFlash: () => {
        const el = hurt.current;
        if (!el) return;
        el.classList.remove('hurt--on');
        void el.offsetWidth;
        el.classList.add('hurt--on');
      },
    });
    const start: PlayerSetup = { loadout: cloneLoadout(profile.loadout), potions: 1 };
    h.startUids = new Set(
      [
        profile.loadout.weapon,
        profile.loadout.helmet,
        profile.loadout.chest,
        profile.loadout.boots,
        ...profile.loadout.artifacts,
      ]
        .filter((x) => !!x)
        .map((x) => x!.uid),
    );
    let disposed = false;
    h.input.onPause = () =>
      setOverlay((o) => (o === null ? 'pause' : o === 'pause' || o === 'inventory' ? null : o));
    h.input.onInventory = () =>
      setOverlay((o) => (o === null ? 'inventory' : o === 'inventory' ? null : o));
    h.start(0, [start])
      .then(() => {
        if (disposed) return;
        setHost(h);
        window.__AO__ = {
          screen: 'game',
          state: () => h.debugState(),
          enterCombat: flags.e2e ? () => h.e2eEnterCombat() : undefined,
          grant: flags.e2e ? () => h.e2eGrant() : undefined,
          finishFloor: flags.e2e ? () => h.e2eFinishFloor() : undefined,
        };
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
    onFatalError(() => h.stop());
    return () => {
      disposed = true;
      h.destroy();
      window.__AO__ = { screen: 'menu' };
    };
  }, []);

  /** End of run: persist the result into the local profile (M2: cloud save). */
  const finish = (h: GameHost, outcome: 'victory' | 'left' | 'dead') => {
    h.paused = true;
    const stats = runStats(h);
    const p = loadProfile() ?? profile;
    const c = h.carry()[0]!;
    p.runs++;
    p.bestDepth = Math.max(p.bestDepth, h.world.depth + 1);
    if (outcome === 'dead') p.deaths++;
    else {
      if (c.loadout) p.loadout = c.loadout;
      p.stash = [...(c.bag ?? []), ...p.stash].slice(0, STASH_LIMIT);
      p.gold += c.gold ?? 0;
      if (outcome === 'victory') p.victories++;
    }
    saveProfile(p);
    setOverlay({ summary: outcome, stats });
  };

  useEffect(() => {
    const check = () => setPortrait(readViewport().portrait);
    window.addEventListener('resize', check);
    const vis = () => {
      if (document.hidden && overlayRef.current === null) setOverlay('pause');
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('resize', check);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);

  useEffect(() => {
    if (host) host.paused = overlay !== null || portrait;
  }, [host, overlay, portrait]);

  const showTouch = isTouchDevice || navigator.maxTouchPoints > 0;

  return (
    <div class="game" data-testid="game">
      <canvas ref={canvas} />
      <div class="vignette" />
      <div class="hurt" ref={hurt} />
      {host && <Hud host={host} toasts={toasts} />}
      {host &&
        overlay === null &&
        (showTouch ? <TouchControls host={host} /> : <DesktopBar host={host} />)}
      <div class="topbar">
        <button
          class="btn icon-btn"
          aria-label="Сумка"
          data-testid="btn-bag"
          onClick={() => (sfx.play('ui'), setOverlay('inventory'))}
        >
          <PixelIcon name="bag" />
        </button>
        <button
          class="btn icon-btn"
          aria-label={t('controls.pause')}
          data-testid="btn-pause"
          onClick={() => (sfx.play('ui'), setOverlay('pause'))}
        >
          <PixelIcon name="pause" />
        </button>
      </div>
      {host && flags.debug && <DebugOverlay stats={host.stats} />}
      {overlay === 'pause' && !portrait && (
        <div class="overlay">
          <div class="panel">
            <h2>{t('pause.title')}</h2>
            <button class="btn btn--primary" onClick={() => setOverlay(null)}>
              {t('pause.resume')}
            </button>
            <button class="btn" onClick={() => setOverlay('inventory')}>
              Снаряжение и сумка
            </button>
            <button class="btn" onClick={() => sfx.setMuted(!sfx.muted)}>
              Звук: {sfx.muted ? 'выкл' : 'вкл'}
            </button>
            <button class="btn" onClick={() => host && finish(host, 'dead')}>
              Сдаться (потерять добычу)
            </button>
          </div>
        </div>
      )}
      {overlay === 'inventory' && host && (
        <Inventory host={host} onClose={() => setOverlay(null)} />
      )}
      {overlay === 'floor' && host && (
        <FloorChoice
          atlas={host.atlas}
          stats={runStats(host)}
          onDeeper={() => {
            host.elapsedBefore += host.world.ticksPlayed / 30;
            host.nextFloor();
            setOverlay(null);
          }}
          onLeave={() => finish(host, 'left')}
        />
      )}
      {overlay !== null && typeof overlay === 'object' && host && (
        <RunSummary
          atlas={host.atlas}
          outcome={overlay.summary}
          stats={overlay.stats}
          onDone={onExit}
        />
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
