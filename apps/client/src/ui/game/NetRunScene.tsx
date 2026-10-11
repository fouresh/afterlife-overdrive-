import {
  applyRunResult,
  type ItemInstance,
  type NetRunResult,
  type RunReward,
  type ServerMsg,
} from '@ao/sim';
import { useEffect, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/sfx';
import { onFatalError, showFatalError } from '../../core/errors';
import { flags, isTouchDevice } from '../../core/flags';
import { readViewport } from '../../core/viewport';
import type { Atlas } from '../../game/atlas';
import { GameHost } from '../../game/host';
import { NetRun } from '../../net/netrun';
import { party } from '../../net/party';
import type { AccountStore } from '../../state/account';
import { t } from '../../i18n';
import { DebugOverlay } from '../DebugOverlay';
import { Hud } from '../hud/Hud';
import { PixelIcon } from '../PixelIcon';
import { Inventory } from '../screens/Inventory';
import type { RunStats } from '../screens/RunEnd';
import { DesktopBar, TouchControls } from '../TouchControls';
import { useParty } from './panels/PartyPanel';
import { Summary } from './RunScene';
import { useToasts } from './useToasts';

type VoteMsg = Extract<ServerMsg, { t: 'vote' }>;
type Overlay =
  | null
  | 'pause'
  | 'inventory'
  | { summary: NetRunResult['outcome']; stats: RunStats; reward: RunReward };

function statsOf(r: NetRunResult, startUids: Set<string>, floors: number): RunStats {
  const l = r.carry.loadout;
  const equipped = l ? [l.weapon, l.helmet, l.chest, l.boots, ...l.artifacts] : [];
  return {
    gold: r.carry.gold ?? 0,
    kills: r.carry.kills ?? 0,
    items: [...(r.carry.bag ?? []), ...equipped].filter(
      (x): x is ItemInstance => !!x && !startUids.has(x.uid),
    ),
    depth: r.depth - 1,
    floors,
    seconds: r.seconds,
  };
}

/**
 * A co-op run: the server simulates, this scene renders the mirrored world, predicts our hero,
 * shows the stairs vote, spectating after death, reconnection, and applies our result to the
 * save when the server sends it.
 */
export function NetRunScene(props: {
  store: AccountStore;
  atlas: Atlas;
  charId: string;
  onDone: () => void;
}) {
  const { store, charId } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<GameHost | null>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [vote, setVote] = useState<{ msg: VoteMsg; at: number } | null>(null);
  const [portrait, setPortrait] = useState(readViewport().portrait);
  const [toasts, toast] = useToasts();
  const [, force] = useState(0);
  const hurt = useRef<HTMLDivElement>(null);
  const netRef = useRef<NetRun | null>(null);
  const finished = useRef(false);
  const st = useParty();
  const c = store.character(charId);

  const startUids = useRef(new Set<string>());

  /** Apply our result to the save and show the summary. */
  const finish = (r: NetRunResult) => {
    if (finished.current) return;
    finished.current = true;
    const net = netRef.current;
    const stats = statsOf(r, startUids.current, net?.floorMsg?.run.floors ?? 3);
    let reward: RunReward = { levels: 0, xp: 0, gold: 0, items: [], lost: [] };
    void store
      .mutate((save) => {
        const ch = save.characters.find((x) => x.id === charId);
        if (!ch || ch.dead) return;
        reward = applyRunResult(
          save,
          ch,
          {
            outcome: r.outcome,
            carry: r.carry,
            depth: r.depth,
            bossKilled: r.bossKilled,
            seconds: r.seconds,
            killedBy: r.killedBy,
          },
          Date.now(),
        );
      })
      .then(() => {
        setVote(null);
        setOverlay({ summary: r.outcome, stats, reward });
        sfx.play(r.outcome === 'victory' ? 'victory' : r.outcome === 'left' ? 'stairs' : 'die');
      });
  };

  useEffect(() => {
    const ch = store.character(charId)!;
    startUids.current = new Set(
      [
        ch.loadout.weapon,
        ch.loadout.helmet,
        ch.loadout.chest,
        ch.loadout.boots,
        ...ch.loadout.artifacts,
      ]
        .filter((x): x is ItemInstance => !!x)
        .map((x) => x.uid),
    );
    // Potions and the elixir go into the run.
    void store.mutate((save) => {
      const x = save.characters.find((y) => y.id === charId);
      if (x) x.potions = 0;
    });
    const h = new GameHost(canvas.current!, {
      onOutcome: () => undefined,
      toast,
      hurtFlash: () => {
        const el = hurt.current;
        if (!el) return;
        el.classList.remove('hurt--on');
        void el.offsetWidth;
        el.classList.add('hurt--on');
      },
    });
    const net = new NetRun(
      party,
      { level: ch.level, attrs: { ...ch.attrs }, origin: ch.origin, elixir: ch.elixir },
      {
        floor: (w, msg) => {
          h.netFloor(w);
          setVote(null);
          if (msg.depth > 0) toast(`Этаж ${msg.depth + 1} из ${msg.run.floors}`, 'info');
        },
        vote: (msg) => setVote({ msg, at: performance.now() }),
        result: (r) => finish(r),
        runEnd: () => {
          if (!finished.current) props.onDone();
        },
        error: (code) => toast(code, 'warn'),
      },
    );
    netRef.current = net;
    party.setRunMode(true);
    let disposed = false;
    h.input.onPause = () =>
      setOverlay((o) => (o === null ? 'pause' : o === 'pause' || o === 'inventory' ? null : o));
    h.input.onInventory = () =>
      setOverlay((o) => (o === null ? 'inventory' : o === 'inventory' ? null : o));
    h.startNet(net)
      .then(() => {
        if (disposed) return;
        setHost(h);
        window.__AO__ = {
          screen: 'netrun',
          state: () => ({ ...h.debugState(), net: h.stats.net }),
          dropNet: flags.e2e ? () => party.debugDrop() : undefined,
        };
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
    onFatalError(() => h.stop());
    // Tell the server we stopped before the tab goes to sleep (it repeats the last input).
    const vis = () => {
      if (document.hidden) net.sendIdle(performance.now());
    };
    document.addEventListener('visibilitychange', vis);
    const check = () => setPortrait(readViewport().portrait);
    window.addEventListener('resize', check);
    const timer = setInterval(() => force((n) => n + 1), 250);
    return () => {
      disposed = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('resize', check);
      party.setRunMode(false);
      h.destroy();
    };
  }, []);

  // Connection lost for good: XP counts, the run's loot is lost, the hero lives.
  useEffect(() => {
    if (st.status !== 'lost' || finished.current) return;
    const self = netRef.current?.dec.self;
    finish({
      outcome: 'lost',
      carry: { xp: self?.xp ?? 0, kills: self?.kills ?? 0 },
      depth: (netRef.current?.world?.depth ?? 0) + 1,
      bossKilled: false,
      seconds: 0,
      killedBy: '',
    });
    party.acknowledgeLost();
  }, [st.status]);

  useEffect(() => {
    if (host) host.paused = overlay !== null || portrait || vote !== null;
  }, [host, overlay, portrait, vote]);

  const me = host?.me();
  const showTouch = isTouchDevice || navigator.maxTouchPoints > 0;
  const summary = overlay !== null && typeof overlay === 'object' ? overlay : null;
  return (
    <div class="game" data-testid="game" data-net="1">
      <canvas ref={canvas} />
      <div class="vignette" />
      <div class="hurt" ref={hurt} />
      {host && <Hud host={host} toasts={toasts} />}
      {host && <PartyHud host={host} />}
      {host &&
        overlay === null &&
        !vote &&
        me &&
        !me.dead &&
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
      {host && flags.debug && <DebugOverlay stats={host.stats} extra={() => host.stats.net} />}
      {st.status === 'reconnecting' && !summary && (
        <div class="netbanner" data-testid="reconnecting">
          Связь потеряна — переподключаемся…
        </div>
      )}
      {me?.dead && !summary && !vote && (
        <div class="spectate" data-testid="spectate">
          <div>
            {me.hardcore
              ? '☠ Вы погибли навсегда. Можно наблюдать за отрядом.'
              : 'Вы пали. Союзник может поднять вас: пусть подойдёт и удерживает «руку».'}
          </div>
          <button class="btn btn--small" onClick={() => party.send({ t: 'quit' })}>
            {me.hardcore ? 'Выйти' : 'Сдаться'}
          </button>
        </div>
      )}
      {overlay === 'pause' && !portrait && (
        <div class="overlay">
          <div class="panel">
            <h2>{t('pause.title')}</h2>
            <p class="runend__text">В отряде игра не останавливается.</p>
            <button class="btn btn--primary" onClick={() => setOverlay(null)}>
              {t('pause.resume')}
            </button>
            <button class="btn" onClick={() => setOverlay('inventory')}>
              Снаряжение и сумка
            </button>
            <button class="btn" onClick={() => sfx.setMuted(!sfx.muted)}>
              Звук: {sfx.muted ? 'выкл' : 'вкл'}
            </button>
            <button class="btn" data-testid="btn-quit" onClick={() => party.send({ t: 'quit' })}>
              {c?.hardcore ? 'Сдаться (☠ герой погибнет!)' : 'Покинуть забег (добыча потеряна)'}
            </button>
          </div>
        </div>
      )}
      {overlay === 'inventory' && host && (
        <Inventory host={host} onClose={() => setOverlay(null)} />
      )}
      {vote && !summary && host && (
        <VotePanel
          msg={vote.msg}
          since={vote.at}
          names={host.names}
          local={host.localIndex}
          dead={!!me?.dead}
          depth={host.world.depth}
          floors={host.world.floors}
        />
      )}
      {summary && host && (
        <Summary
          atlas={host.atlas}
          outcome={summary.summary}
          stats={summary.stats}
          reward={summary.reward}
          hardcore={!!c?.hardcore}
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

/** Teammates: name + HP (dead / gone shown). */
function PartyHud({ host }: { host: GameHost }) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), 200);
    return () => clearInterval(id);
  }, []);
  const w = host.world;
  const rows = w.players.filter((p) => p.index !== host.localIndex);
  if (rows.length === 0) return null;
  return (
    <div class="partyhud" data-testid="party-hud">
      {rows.map((p) => {
        const hp = w.e.hp[p.ent] ?? 0;
        const max = w.e.maxHp[p.ent] || 1;
        return (
          <div class={`partyhud__row${p.dead ? ' partyhud__row--dead' : ''}`} key={p.index}>
            <span class="partyhud__name">
              {p.hardcore && '☠'}
              {host.names[p.index] ?? '?'}
            </span>
            {p.gone ? (
              <span class="partyhud__state">ушёл</span>
            ) : p.dead ? (
              <span class="partyhud__state">{p.hardcore ? 'погиб' : 'пал — поднимите!'}</span>
            ) : (
              <span class="partyhud__bar">
                <span style={{ width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%` }} />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function VotePanel(props: {
  msg: VoteMsg;
  since: number;
  names: string[];
  local: number;
  dead: boolean;
  depth: number;
  floors: number;
}) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(
    0,
    Math.ceil((props.msg.leftMs - (performance.now() - props.since)) / 1000),
  );
  const mine = props.msg.choices[props.local];
  const label = (c: VoteMsg['choices'][number]) =>
    c === 'deeper' ? 'глубже' : c === 'leave' ? 'домой' : c === 'dead' ? 'пал' : '…';
  return (
    <div class="overlay" data-testid="floor-vote">
      <div class="panel runend">
        <h2>Этаж {props.depth + 1} пройден</h2>
        <p class="runend__text">
          Каждый решает сам: спуститься глубже или вернуться в Убежище с добычей. Осталось {left} с.
        </p>
        <div class="votelist">
          {props.msg.choices.map((c, i) =>
            c === null ? null : (
              <span key={i} class={`votechip votechip--${c}`}>
                {props.names[i] ?? '?'}: {label(c)}
              </span>
            ),
          )}
        </div>
        {props.dead ? (
          <p class="runend__text">Вы пали — добыча этого забега потеряна.</p>
        ) : mine ? (
          <p class="runend__text">Ждём остальных…</p>
        ) : (
          <>
            <button
              class="btn btn--primary"
              data-testid="btn-deeper"
              onClick={() => party.send({ t: 'vote', choice: 'deeper' })}
            >
              Глубже — этаж {props.depth + 2}/{props.floors}
            </button>
            <button
              class="btn"
              data-testid="btn-leave"
              onClick={() => party.send({ t: 'vote', choice: 'leave' })}
            >
              Уйти с добычей
            </button>
          </>
        )}
      </div>
    </div>
  );
}
