import { getContent } from '@ao/content';
import { createCharacter, starterItem, type Difficulty, type RunConfig } from '@ao/sim';
import { useEffect, useState } from 'preact/hooks';
import { showFatalError } from '../../core/errors';
import { flags } from '../../core/flags';
import type { Atlas } from '../../game/atlas';
import { getAtlas } from '../../game/host';
import { party } from '../../net/party';
import { getStore, type AccountStore } from '../../state/account';
import { t } from '../../i18n';
import { CharacterCreator, type CreatorResult } from './CharacterCreator';
import { CharacterSelect } from './CharacterSelect';
import { HubScene } from './HubScene';
import { Intro } from './Intro';
import { NetRunScene } from './NetRunScene';
import { RunScene } from './RunScene';

declare global {
  interface Window {
    /** Read-only hook for e2e tests and bug reports. */
    __AO__?: {
      screen: string;
      state?: () => unknown;
      enterCombat?: () => boolean;
      grant?: () => void;
      finishFloor?: () => void;
      talk?: (station: string) => void;
      dropNet?: () => void;
      rescue?: () => string | null;
    };
  }
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'select' }
  | { kind: 'create' }
  | { kind: 'intro'; draft: CreatorResult }
  | { kind: 'hub'; charId: string }
  | { kind: 'run'; charId: string; cfg: RunConfig }
  | { kind: 'netrun'; charId: string; n: number };

function newId(): string {
  const b = new Uint32Array(2);
  crypto.getRandomValues(b);
  return `c${b[0]!.toString(36)}${b[1]!.toString(36)}`;
}

/** Everything after the main menu: characters → intro → hub ⇄ runs. */
export default function GameRoot({ onExit }: { onExit: () => void }) {
  const [store, setStore] = useState<AccountStore | null>(null);
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  useEffect(() => {
    Promise.all([getStore(), getAtlas()])
      .then(([s, a]) => {
        setStore(s);
        setAtlas(a);
        const living = s.save.characters.filter((c) => !c.dead);
        setPhase(living.length === 0 ? { kind: 'create' } : { kind: 'select' });
      })
      .catch((err: unknown) => showFatalError(err instanceof Error ? err : new Error(String(err))));
  }, []);

  useEffect(() => {
    window.__AO__ = { ...window.__AO__, screen: phase.kind };
  }, [phase.kind]);

  // A co-op run started (the leader opened the portal): switch to the networked run.
  useEffect(() => {
    const go = () =>
      setPhase((p) => (p.kind === 'hub' ? { kind: 'netrun', charId: p.charId, n: Date.now() } : p));
    party.onRunStart = go;
    return () => {
      party.onRunStart = null;
    };
  }, []);
  useEffect(() => {
    if (phase.kind === 'hub' && party.hasPendingFloor()) {
      setPhase({ kind: 'netrun', charId: phase.charId, n: Date.now() });
    }
  }, [phase.kind]);

  if (!store || !atlas || phase.kind === 'loading') return <div class="screen">{t('loading')}</div>;

  switch (phase.kind) {
    case 'select':
      return (
        <CharacterSelect
          store={store}
          onBack={onExit}
          onCreate={() => setPhase({ kind: 'create' })}
          onPlay={(id) => setPhase({ kind: 'hub', charId: id })}
        />
      );
    case 'create':
      return (
        <CharacterCreator
          atlas={atlas}
          onCancel={() =>
            store.save.characters.some((c) => !c.dead) ? setPhase({ kind: 'select' }) : onExit()
          }
          onDone={(draft) => setPhase({ kind: 'intro', draft })}
        />
      );
    case 'intro':
      return (
        <Intro
          name={phase.draft.name}
          onDone={(origin) => {
            const id = newId();
            const d = phase.draft;
            void store
              .mutate((save) => {
                const c = createCharacter(
                  {
                    name: d.name,
                    appearance: d.appearance,
                    hardcore: d.hardcore,
                    origin,
                    weapon: starterItem(d.weapon),
                    artifact: starterItem(d.artifact),
                  },
                  id,
                  Date.now(),
                );
                c.introSeen = true;
                save.characters.push(c);
              })
              .then(() => setPhase({ kind: 'hub', charId: id }));
          }}
        />
      );
    case 'hub':
      return (
        <HubScene
          key={phase.charId}
          store={store}
          atlas={atlas}
          charId={phase.charId}
          onExit={() => {
            party.leave();
            setPhase({ kind: 'select' });
          }}
          onRun={(biome: string, difficulty: Difficulty) => {
            // A solo run: no party (it would wait for us).
            party.leave();
            void store.runSeed(biome).then(({ seed }) => {
              setPhase({
                kind: 'run',
                charId: phase.charId,
                cfg: {
                  seed: flags.seed ?? seed,
                  biome,
                  floors: getContent().biomes.get(biome)?.floors ?? 3,
                  difficulty,
                },
              });
            });
          }}
        />
      );
    case 'netrun': {
      const charId = phase.charId;
      return (
        <NetRunScene
          key={phase.n}
          store={store}
          atlas={atlas}
          charId={charId}
          onDone={() => {
            const c = store.character(charId);
            if (!c || c.dead) party.leave();
            setPhase(c && !c.dead ? { kind: 'hub', charId } : { kind: 'select' });
          }}
        />
      );
    }
    case 'run': {
      const charId = phase.charId;
      return (
        <RunScene
          key={phase.cfg.seed}
          store={store}
          atlas={atlas}
          charId={charId}
          cfg={phase.cfg}
          onDone={() => {
            const c = store.character(charId);
            setPhase(c && !c.dead ? { kind: 'hub', charId } : { kind: 'select' });
          }}
        />
      );
    }
  }
}
