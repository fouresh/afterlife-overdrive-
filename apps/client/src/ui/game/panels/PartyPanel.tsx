import { netCharOf, ROOM_SIZE } from '@ao/sim';
import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../../audio/sfx';
import { copyText } from '../../../core/errors';
import { inviteUrl, party, type PartyState, type PublicRoom } from '../../../net/party';
import { PixelIcon } from '../../PixelIcon';
import { Panel, useCtx, type PanelCtx } from './common';

/** Re-render on party changes. */
export function useParty(): PartyState {
  const [, set] = useState(0);
  useEffect(() => party.subscribe(() => set((n) => n + 1)), []);
  return party.state;
}

const ERRORS: Record<string, string> = {
  not_found: 'Отряд не найден — проверьте код',
  full: 'В отряде уже 4 героя',
  offline: 'Нет связи с сервером',
  rate_limited: 'Слишком часто — подождите минуту',
  bad_code: 'Код — 5 латинских букв и цифр',
  kicked: 'Лидер исключил вас из отряда',
  replaced: 'Отряд открыт на другом устройстве или вкладке',
  timeout: 'Связь с отрядом потеряна',
  no_seat: 'Связь с отрядом потеряна',
  bad_name: 'Имя героя не прошло проверку',
  bad_attrs: 'Сервер не принял героя',
  level_too_low: 'Сложность недоступна: у кого-то в отряде мал уровень',
  invalid: 'Сервер не принял героя',
  unauthorized: 'Нет аккаунта — проверьте связь',
};

export function partyError(code: string | null): string | null {
  if (!code) return null;
  return ERRORS[code] ?? `Ошибка: ${code}`;
}

/** Share an invite link (Web Share API on phones, clipboard otherwise). */
export async function shareInvite(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = inviteUrl(code);
  const text = `Заходи в мой отряд в Afterlife Overdrive! Код: ${code}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Afterlife Overdrive', text, url });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  return (await copyText(`${text}\n${url}`)) ? 'copied' : 'failed';
}

/** Create / join a party, see members, invite friends. */
export function PartyPanel({ ctx, onClose }: { ctx: PanelCtx; onClose: () => void }) {
  const st = useParty();
  const { c } = useCtx(ctx);
  const [code, setCode] = useState('');
  const [isPublic, setPublic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<PublicRoom[] | null | 'error'>(null);

  const refresh = () => {
    setRooms(null);
    void party.listPublic().then((r) => setRooms(r ?? 'error'));
  };
  useEffect(() => {
    if (!party.inParty) refresh();
  }, [st.code]);

  const run = async (fn: (token: string) => Promise<string | null>) => {
    setBusy(true);
    const token = await ctx.store.authToken();
    const err = token ? await fn(token) : 'offline';
    setBusy(false);
    if (err) {
      sfx.play('deny');
      ctx.toast(partyError(err) ?? err, 'warn');
    } else sfx.play('ui', { pitch: 1.2 });
  };
  const create = () => run((t) => party.create(t, netCharOf(c), isPublic));
  const join = (raw: string) => run((t) => party.join(t, raw, netCharOf(c)));

  if (!party.inParty) {
    return (
      <Panel
        title="Отряд"
        subtitle="До 4 героев. Обычные и хардкор — вместе можно."
        onClose={onClose}
      >
        <div class="inv__label">Свой отряд</div>
        <label class="field field--check">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={() => setPublic(!isPublic)}
            data-testid="party-public"
          />
          Показывать в списке открытых отрядов
        </label>
        <button
          class="btn btn--primary"
          disabled={busy}
          onClick={create}
          data-testid="btn-party-create"
        >
          Создать отряд
        </button>
        <div class="inv__label">Войти по коду</div>
        <div class="coderow">
          <input
            class="input codeinput"
            value={code}
            maxLength={5}
            placeholder="КОД"
            autocapitalize="characters"
            autocomplete="off"
            spellcheck={false}
            onInput={(e) => setCode((e.currentTarget as HTMLInputElement).value.toUpperCase())}
            data-testid="party-code-input"
          />
          <button
            class="btn"
            disabled={busy || code.length < 5}
            onClick={() => join(code)}
            data-testid="btn-party-join"
          >
            Войти
          </button>
        </div>
        <div class="inv__label">
          Открытые отряды{' '}
          <button class="btn btn--small" onClick={refresh} aria-label="Обновить">
            ↻
          </button>
        </div>
        {rooms === null && <div class="statline">Загрузка…</div>}
        {rooms === 'error' && <div class="statline">Нет связи с сервером.</div>}
        {Array.isArray(rooms) && rooms.length === 0 && (
          <div class="statline">Пока никого — создайте открытый отряд!</div>
        )}
        {Array.isArray(rooms) &&
          rooms.map((r) => (
            <button
              key={r.code}
              type="button"
              class="shoprow shoprow--btn"
              disabled={busy}
              onClick={() => join(r.code)}
            >
              <div class="shoprow__text">
                <div class="shoprow__name">
                  {r.leaderName} · ур. {r.leaderLevel}
                </div>
                <div class="shoprow__desc">
                  {r.players}/{ROOM_SIZE} · {r.state === 'run' ? 'в забеге' : 'ждут в убежище'} ·{' '}
                  {r.code}
                </div>
              </div>
            </button>
          ))}
        {st.error && <div class="warnline">{partyError(st.error)}</div>}
      </Panel>
    );
  }

  const slots = Array.from({ length: ROOM_SIZE }, (_, i) => st.members.find((m) => m.slot === i));
  const status =
    st.status === 'online'
      ? st.phase === 'run'
        ? 'отряд в забеге'
        : 'на связи'
      : st.status === 'reconnecting'
        ? 'переподключение…'
        : 'подключение…';
  return (
    <Panel title="Отряд" subtitle={`Код ${st.code} · ${status}`} onClose={onClose}>
      <div class="partycode" data-testid="party-code">
        {st.code}
      </div>
      <button
        class="btn btn--primary"
        onClick={() =>
          void shareInvite(st.code!).then((r) =>
            ctx.toast(
              r === 'copied'
                ? 'Ссылка скопирована'
                : r === 'failed'
                  ? inviteUrl(st.code!)
                  : 'Готово',
              'good',
            ),
          )
        }
        data-testid="btn-party-share"
      >
        <PixelIcon name="share" class="btn__icon" /> Пригласить друзей
      </button>
      <div class="inv__label">Герои</div>
      <div class="partylist" data-testid="party-members">
        {slots.map((m, i) =>
          m ? (
            <div class={`partymember${m.online ? '' : ' partymember--off'}`} key={i}>
              <span class="partymember__name">
                {m.hardcore && <span class="skull">☠</span>}
                {m.name}
              </span>
              <span class="partymember__meta">
                ур. {m.level}
                {m.slot === st.leader && ' · лидер'}
                {m.slot === st.slot && ' · вы'}
                {!m.online && ' · нет связи'}
                {m.inRun && ' · в забеге'}
              </span>
              {party.isLeader && m.slot !== st.slot && st.phase === 'lobby' && (
                <button
                  class="btn btn--small"
                  onClick={() => party.send({ t: 'kick', slot: m.slot })}
                  aria-label={`Исключить ${m.name}`}
                >
                  ✕
                </button>
              )}
            </div>
          ) : (
            <div class="partymember partymember--empty" key={i}>
              свободно
            </div>
          ),
        )}
      </div>
      {party.isLeader && (
        <label class="field field--check">
          <input
            type="checkbox"
            checked={st.isPublic}
            onChange={() => party.send({ t: 'public', value: !st.isPublic })}
          />
          Открытый отряд (виден всем в списке)
        </label>
      )}
      <div class="statline">
        {party.isLeader
          ? 'Вы лидер: подойдите к порталу, чтобы начать забег всем отрядом.'
          : 'Забег начнёт лидер у портала — вас перенесёт автоматически.'}
      </div>
      <button class="btn" onClick={() => party.leave()} data-testid="btn-party-leave">
        Покинуть отряд
      </button>
    </Panel>
  );
}
