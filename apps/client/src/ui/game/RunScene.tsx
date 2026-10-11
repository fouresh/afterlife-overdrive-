import {
  DEFAULT_APPEARANCE,
  contentRu,
  getContent,
  type Appearance,
  type EquipLook,
} from '@ao/content';
import { applyRunResult, runSetup, type Outcome, type RunConfig, type RunReward } from '@ao/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/sfx';
import { onFatalError, showFatalError } from '../../core/errors';
import { flags, isTouchDevice } from '../../core/flags';
import { readViewport } from '../../core/viewport';
import type { Atlas } from '../../game/atlas';
import { GameHost } from '../../game/host';
import type { AccountStore } from '../../state/account';
import { t } from '../../i18n';
import { DebugOverlay } from '../DebugOverlay';
import { Hud } from '../hud/Hud';
import { ItemIcon } from '../ItemIcon';
import { PixelIcon } from '../PixelIcon';
import { Inventory } from '../screens/Inventory';
import { FloorChoice, type RunStats } from '../screens/RunEnd';
import { DesktopBar, TouchControls } from '../TouchControls';
import { DialogOverlay } from './Dialog';
import { useToasts } from './useToasts';

type Overlay =
  | null
  | 'pause'
  | 'inventory'
  | 'floor'
  | { summary: 'victory' | 'left' | 'dead'; stats: RunStats; reward: RunReward };

function runStats(host: GameHost): RunStats {
  const c = host.carry()[0]!;
  const loadout = c.loadout;
  const equipped = loadout
    ? [loadout.weapon, loadout.helmet, loadout.chest, loadout.boots, ...loadout.artifacts]
    : [];
  return {
    gold: c.gold ?? 0,
    kills: c.kills ?? 0,
    items: [...(c.bag ?? []), ...equipped.filter((x) => x && !host.startUids.has(x.uid))].filter(
      (x): x is NonNullable<typeof x> => !!x,
    ),
    depth: host.world.depth,
    floors: host.world.floors,
    seconds: host.world.ticksPlayed / 30 + host.elapsedBefore,
  };
}

/** One dungeon run for a character; results are written into the account save. */
export function RunScene(props: {
  store: AccountStore;
  atlas: Atlas;
  charId: string;
  cfg: RunConfig;
  onDone: () => void;
}) {
  const { store, charId } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<GameHost | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [portrait, setPortrait] = useState(readViewport().portrait);
  const [toasts, toast] = useToasts();
  const hurt = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<Overlay>(null);
  overlayRef.current = overlay;
  const finished = useRef(false);

  /** End of run: apply results to the character/realm (cloud sync follows). */
  const finish = (h: GameHost, outcome: 'victory' | 'left' | 'dead') => {
    if (finished.current) return;
    finished.current = true;
    h.paused = true;
    const stats = runStats(h);
    let reward: RunReward = { levels: 0, xp: 0, gold: 0, items: [], lost: [] };
    void store
      .mutate((save) => {
        const c = save.characters.find((x) => x.id === charId)!;
        const carry = h.carry()[0]!;
        reward = applyRunResult(
          save,
          c,
          {
            outcome,
            carry,
            depth: h.world.depth + 1,
            bossKilled: h.world.bossKilled,
            seconds: stats.seconds,
            killedBy: h.lastHitBy(),
          },
          Date.now(),
        );
      })
      .then(() => setOverlay({ summary: outcome, stats, reward }));
  };

  useEffect(() => {
    const c = store.character(charId)!;
    const h = new GameHost(canvas.current!, {
      onOutcome: (o: Outcome) => {
        if (o === 'exit') {
          h.paused = true;
          setOverlay('floor');
        } else if (o === 'victory') finish(h, 'victory');
        else if (o === 'dead') setTimeout(() => finish(h, 'dead'), 600);
      },
      toast,
      hurtFlash: () => {
        const el = hurt.current;
        if (!el) return;
        el.classList.remove('hurt--on');
        void el.offsetWidth;
        el.classList.add('hurt--on');
      },
    });
    h.appearances = [c.appearance];
    const setup = runSetup(c);
    h.startUids = new Set(
      [c.loadout.weapon, c.loadout.helmet, c.loadout.chest, c.loadout.boots, ...c.loadout.artifacts]
        .filter((x) => !!x)
        .map((x) => x!.uid),
    );
    // Potions are taken from the character when the run starts.
    void store.mutate((save) => {
      const ch = save.characters.find((x) => x.id === charId)!;
      ch.potions = 0;
    });
    let disposed = false;
    h.input.onPause = () =>
      setOverlay((o) => (o === null ? 'pause' : o === 'pause' || o === 'inventory' ? null : o));
    h.input.onInventory = () =>
      setOverlay((o) => (o === null ? 'inventory' : o === 'inventory' ? null : o));
    h.start(props.cfg, 0, [setup])
      .then(() => {
        if (disposed) return;
        setHost(h);
        window.__AO__ = {
          screen: 'run',
          state: () => h.debugState(),
          enterCombat: flags.e2e ? () => h.e2eEnterCombat() : undefined,
          grant: flags.e2e ? () => h.e2eGrant() : undefined,
          finishFloor: flags.e2e ? () => h.e2eFinishFloor() : undefined,
          rescue: flags.e2e ? () => h.e2eRescue() : undefined,
        };
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
    onFatalError(() => h.stop());
    return () => {
      disposed = true;
      h.destroy();
    };
  }, []);

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
  const c = store.character(charId);
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
              {c?.hardcore ? 'Сдаться (☠ герой погибнет!)' : 'Сдаться (потерять добычу)'}
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
        <Summary
          atlas={host.atlas}
          outcome={overlay.summary}
          stats={overlay.stats}
          reward={overlay.reward}
          hardcore={!!c?.hardcore}
          hero={{ name: c?.name ?? '', appearance: c?.appearance ?? DEFAULT_APPEARANCE }}
          onDone={props.onDone}
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

export function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function Summary(props: {
  atlas: Atlas;
  outcome: 'victory' | 'left' | 'dead' | 'lost';
  stats: RunStats;
  reward: RunReward;
  hardcore: boolean;
  hero: { name: string; appearance: Appearance; look?: EquipLook };
  onDone: () => void;
}) {
  const s = props.stats;
  const r = props.reward;
  const content = getContent();
  const cuts = (r.cutscenes ?? []).map((id) => content.dialogs.get(id)).filter((d) => !!d);
  // Story cutscenes play first (the boss falls…), then the summary.
  const [cut, setCut] = useState(cuts.length ? 0 : -1);
  if (cut >= 0 && cuts[cut]) {
    return (
      <DialogOverlay
        dialog={cuts[cut]}
        hero={props.hero}
        onDone={() => setCut(cut + 1 < cuts.length ? cut + 1 : -1)}
      />
    );
  }
  const dead = props.outcome === 'dead' || props.outcome === 'lost';
  const title =
    props.outcome === 'victory'
      ? 'Победа!'
      : props.outcome === 'left'
        ? 'Вы вернулись живым'
        : props.outcome === 'lost'
          ? 'Связь с отрядом потеряна'
          : props.hardcore
            ? '☠ Герой пал навсегда'
            : 'Вы погибли';
  const text =
    props.outcome === 'lost'
      ? 'Герой жив и опыт засчитан, но добыча этого забега потеряна.'
      : dead
        ? props.hardcore
          ? 'Его имя высечено в Зале памяти.'
          : 'Добыча этого забега потеряна. Снаряжение, с которым вы пришли, и опыт остались.'
        : 'Добыча сохранена: надетое на вас, остальное — на складе.';
  return (
    <div class="overlay" data-testid="run-summary">
      <div class={`panel runend runend--${props.outcome}`}>
        <h2>{title}</h2>
        <p class="runend__text">{text}</p>
        <div class="runend__stats">
          <span>
            Этаж: {s.depth + 1}/{s.floors}
          </span>
          <span>Убито: {s.kills}</span>
          <span>Золото: {r.gold}</span>
          <span>Опыт: +{r.xp}</span>
          <span>Время: {fmtTime(s.seconds)}</span>
        </div>
        {(r.quests ?? []).map((id) => {
          const q = content.questById.get(id);
          return (
            <div class="questdone" key={id} data-testid="quest-done">
              Задание выполнено: {q ? contentRu[q.titleKey] : id}
            </div>
          );
        })}
        {r.levels > 0 && (
          <div class="levelup">
            Новый уровень! +{r.levels * 3} очков характеристик — загляните к статуе.
          </div>
        )}
        {s.items.length > 0 && (
          <div class={`runend__items${dead ? ' runend__items--lost' : ''}`}>
            {s.items.slice(0, 16).map((it) => (
              <ItemIcon key={it.uid} atlas={props.atlas} item={it} />
            ))}
          </div>
        )}
        <button class="btn btn--primary" data-testid="btn-summary-done" onClick={props.onDone}>
          {props.hardcore && props.outcome === 'dead'
            ? 'К выбору героя'
            : `В ${contentRu['hub.title']?.toLowerCase() ?? 'убежище'}`}
        </button>
      </div>
    </div>
  );
}
