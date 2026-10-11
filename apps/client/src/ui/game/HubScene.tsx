import {
  HUB_STATIONS,
  contentRu,
  getContent,
  type DialogDef,
  type HubStation,
  type StoryRule,
} from '@ao/content';
import { hubFloor } from '@ao/procgen';
import {
  applyStoryRule,
  currentMainQuest,
  netCharOf,
  realmOf,
  recomputeStats,
  storyDialog,
  xpToNext,
  type Difficulty,
} from '@ao/sim';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { sfx } from '../../audio/sfx';
import { onFatalError, showFatalError } from '../../core/errors';
import { flags, isTouchDevice } from '../../core/flags';
import { readViewport } from '../../core/viewport';
import type { Atlas } from '../../game/atlas';
import { GameHost, lookOf } from '../../game/host';
import { party } from '../../net/party';
import type { AccountStore } from '../../state/account';
import { DebugOverlay } from '../DebugOverlay';
import { PixelIcon } from '../PixelIcon';
import { DesktopBar, TouchControls } from '../TouchControls';
import { AlchemistPanel } from './panels/AlchemistPanel';
import { AltarPanel } from './panels/AltarPanel';
import { BoardPanel } from './panels/BoardPanel';
import { useStore, type PanelCtx } from './panels/common';
import { ForgePanel } from './panels/ForgePanel';
import { MarketPanel } from './panels/MarketPanel';
import { MemorialPanel } from './panels/MemorialPanel';
import { PartyPanel, partyError, useParty } from './panels/PartyPanel';
import { PortalPanel } from './panels/PortalPanel';
import { StashPanel } from './panels/StashPanel';
import { DialogOverlay } from './Dialog';
import { useToasts } from './useToasts';

interface DialogState {
  def: DialogDef;
  rule?: StoryRule;
  after?: () => void;
}

let pendingInvite: string | null = flags.room ?? null;

/** Take the `?room=CODE` invite once (and drop it from the address bar). */
function takeInvite(): string | null {
  const code = pendingInvite;
  pendingInvite = null;
  if (code && location.search.includes('room=')) {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
  return code;
}

/** Stations present for this character (story flags gate NPCs in later chapters). */
function activeStations(flagsSet: Set<string>): HubStation[] {
  return HUB_STATIONS.filter((s) => !s.requires || flagsSet.has(s.requires));
}

export function HubScene(props: {
  store: AccountStore;
  atlas: Atlas;
  charId: string;
  onRun: (biome: string, difficulty: Difficulty) => void;
  onExit: () => void;
}) {
  const { store, atlas, charId } = props;
  useStore(store);
  const c = store.character(charId)!;
  const canvas = useRef<HTMLCanvasElement>(null);
  const [host, setHost] = useState<GameHost | null>(null);
  const [panel, setPanel] = useState<HubStation['id'] | 'menu' | 'party' | null>(null);
  const pst = useParty();
  const [portrait, setPortrait] = useState(readViewport().portrait);
  const [toasts, toast] = useToasts();
  const stations = useMemo(() => activeStations(new Set(c.story.flags)), [c.story.flags.length]);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  /** Talk to a station: a story dialog first (if one is due), then its panel. */
  const talk = (st: HubStation | undefined) => {
    if (!st) return;
    const npcId = st.npc?.id;
    const d = npcId ? storyDialog(store.character(charId)!, npcId) : null;
    if (d) setDialog({ def: d.dialog, rule: d.rule, after: () => setPanel(st.id) });
    else setPanel(st.id);
  };
  const finishDialog = () => {
    const d = dialog;
    setDialog(null);
    if (!d) return;
    if (d.rule) {
      const rule = d.rule;
      void store.mutate((save) => {
        const ch = save.characters.find((x) => x.id === charId);
        if (ch) applyStoryRule(ch, rule);
      });
    }
    d.after?.();
  };

  useEffect(() => {
    const letters: Record<string, number> = {};
    stations.forEach((s, i) => (letters[s.letter] = i));
    const h = new GameHost(canvas.current!, {
      onOutcome: () => undefined,
      toast,
      hurtFlash: () => undefined,
      onTalk: (i) => talk(stations[i]),
    });
    h.appearances = [c.appearance];
    h.input.onPause = () => setPanel((p) => (p ? null : 'menu'));
    let disposed = false;
    h.startHub(hubFloor(letters), stations, {
      loadout: JSON.parse(JSON.stringify(c.loadout)),
      potions: c.potions,
      progress: { level: c.level, attrs: { ...c.attrs }, origin: c.origin, elixir: c.elixir },
    })
      .then(() => {
        if (disposed) return;
        setHost(h);
        // Story beats that happen on arrival (the awakening, the chapter finale).
        const d = storyDialog(store.character(charId)!, 'hub');
        if (d) setDialog({ def: d.dialog, rule: d.rule });
        window.__AO__ = {
          screen: 'hub',
          state: () => h.debugState(),
          talk: flags.e2e ? (id: string) => setPanel(id as HubStation['id']) : undefined,
        };
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
    onFatalError(() => h.stop());
    return () => {
      disposed = true;
      h.destroy();
    };
  }, []);

  // Keep the hub avatar in sync with equipment/attribute changes made in the panels.
  useEffect(() => {
    if (!host) return;
    const p = host.world.players[0]!;
    p.loadout = JSON.parse(JSON.stringify(c.loadout));
    p.progress = { level: c.level, attrs: { ...c.attrs }, origin: c.origin, elixir: c.elixir };
    recomputeStats(host.world, p);
    host.world.e.hp[p.ent] = host.world.e.maxHp[p.ent]!;
  }, [host, store.save.updatedAt]);

  useEffect(() => {
    const check = () => setPortrait(readViewport().portrait);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (host) host.paused = panel !== null || portrait || dialog !== null;
  }, [host, panel, portrait, dialog]);

  // Party: keep the room's copy of the hero fresh; follow an invite link once.
  useEffect(() => {
    party.updateChar(netCharOf(c));
  }, [store.save.updatedAt]);
  useEffect(() => {
    const code = takeInvite();
    if (!code || (party.inParty && party.state.code === code)) return;
    void store.authToken().then(async (token) => {
      const err = token ? await party.join(token, code, netCharOf(c)) : 'offline';
      if (err) toast(partyError(err) ?? err, 'warn');
      else toast(`Вы в отряде ${code}`, 'good');
    });
  }, []);

  const ctx: PanelCtx = {
    store,
    atlas,
    charId,
    toast,
    say: (id) => {
      const def = getContent().dialogs.get(id);
      if (def) setDialog({ def });
    },
  };
  const quest = currentMainQuest(c);
  const realm = realmOf(store.save, c);
  const showTouch = isTouchDevice || navigator.maxTouchPoints > 0;
  const close = () => setPanel(null);
  const need = xpToNext(c.level);
  return (
    <div class="game" data-testid="hub">
      <canvas ref={canvas} />
      <div class="vignette" />
      <div class="hud">
        <div class="hud__tl">
          <div class="hubname">
            {c.hardcore && <span class="skull">☠</span>}
            {c.name} · ур. {c.level}
            {c.unspent > 0 && <span class="badge">+{c.unspent}</span>}
          </div>
          <div class="xpbar xpbar--thin">
            <div class="xpbar__fill" style={{ width: `${Math.min(100, (c.xp / need) * 100)}%` }} />
          </div>
          <div class="hud__row">
            <span class="hud__stat" data-testid="gold">
              <img src={atlas.dataUrl('prop.coin', 0, 2)} alt="" />
              {realm.gold}
            </span>
            <span class="hud__stat">◇{realm.materials.dust}</span>
            <span class="hud__stat">◆{realm.materials.essence}</span>
            <span class="hud__stat">✦{realm.materials.shard}</span>
          </div>
          <div class="hud__floor">
            {contentRu['hub.title']} · облако: {cloudLabel(store.cloud)}
          </div>
          <div class="journal" data-testid="journal">
            {quest
              ? `▸ ${contentRu[quest.titleKey] ?? quest.id}: ${contentRu[quest.descKey] ?? ''}`
              : c.story.flags.includes('ch1.done')
                ? '▸ Глава 1 пройдена. Продолжение следует…'
                : ''}
          </div>
          {pst.code && (
            <button
              type="button"
              class={`partychip partychip--${pst.status}`}
              onClick={() => setPanel('party')}
              data-testid="party-chip"
            >
              Отряд {pst.code} · {pst.members.length}/4
              {pst.status === 'reconnecting'
                ? ' · связь…'
                : pst.phase === 'run'
                  ? ' · в забеге'
                  : party.isLeader
                    ? ' · вы лидер'
                    : ''}
            </button>
          )}
        </div>
        <div class="toasts">
          {toasts.map((t) => (
            <div key={t.id} class={`toast toast--${t.kind}`}>
              {t.text}
            </div>
          ))}
        </div>
      </div>
      {host &&
        panel === null &&
        !dialog &&
        (showTouch ? <TouchControls host={host} hubMode /> : <DesktopBar host={host} hubMode />)}
      <div class="topbar">
        <button
          class="btn icon-btn"
          aria-label="Отряд"
          data-testid="btn-party"
          onClick={() => (sfx.play('ui'), setPanel('party'))}
        >
          <PixelIcon name="party" />
        </button>
        <button
          class="btn icon-btn"
          aria-label="Меню"
          data-testid="btn-pause"
          onClick={() => (sfx.play('ui'), setPanel('menu'))}
        >
          <PixelIcon name="pause" />
        </button>
      </div>
      {host && flags.debug && <DebugOverlay stats={host.stats} />}
      {panel === 'stash' && <StashPanel ctx={ctx} onClose={close} />}
      {panel === 'forge' && <ForgePanel ctx={ctx} onClose={close} />}
      {panel === 'alchemist' && <AlchemistPanel ctx={ctx} onClose={close} />}
      {panel === 'market' && <MarketPanel ctx={ctx} onClose={close} />}
      {panel === 'altar' && <AltarPanel ctx={ctx} onClose={close} />}
      {panel === 'board' && <BoardPanel ctx={ctx} onClose={close} />}
      {panel === 'memorial' && <MemorialPanel ctx={ctx} onClose={close} />}
      {panel === 'portal' && <PortalPanel ctx={ctx} onClose={close} onStart={props.onRun} />}
      {panel === 'party' && <PartyPanel ctx={ctx} onClose={close} />}
      {panel === 'menu' && (
        <div class="overlay">
          <div class="panel">
            <h2>{contentRu['hub.title']}</h2>
            <button class="btn btn--primary" onClick={close}>
              Продолжить
            </button>
            <button class="btn" onClick={() => setPanel('stash')}>
              Склад и снаряжение
            </button>
            <button class="btn" onClick={() => setPanel('party')}>
              Отряд (мультиплеер)
            </button>
            <button class="btn" onClick={() => sfx.setMuted(!sfx.muted)}>
              Звук: {sfx.muted ? 'выкл' : 'вкл'}
            </button>
            <button class="btn" data-testid="btn-change-hero" onClick={props.onExit}>
              Сменить героя
            </button>
          </div>
        </div>
      )}
      {dialog && (
        <DialogOverlay
          dialog={dialog.def}
          hero={{ name: c.name, appearance: c.appearance, look: lookOf(c.loadout) }}
          onDone={finishDialog}
        />
      )}
      {portrait && (
        <div class="overlay rotate">
          <PixelIcon name="phone" class="rotate__icon" />
          <h2>Поверните телефон</h2>
        </div>
      )}
    </div>
  );
}

function cloudLabel(s: string): string {
  return (
    {
      off: 'выкл',
      syncing: 'синхронизация…',
      synced: 'сохранено',
      offline: 'нет связи',
      error: 'ошибка',
    }[s] ?? s
  );
}
