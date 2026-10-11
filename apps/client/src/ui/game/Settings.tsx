import { useEffect, useState } from 'preact/hooks';
import { sfx } from '../../audio/sfx';
import { copyText } from '../../core/errors';
import { gfx } from '../../game/gfx';
import { getStore, type AccountStore } from '../../state/account';
import { useStore } from './panels/common';

/** Sound, graphics + account: cloud status, recovery code (move progress to another phone). */
export default function Settings({ onBack }: { onBack: () => void }) {
  const [store, setStore] = useState<AccountStore | null>(null);
  useEffect(() => {
    void getStore().then(setStore);
  }, []);
  if (!store) return <div class="screen">Загрузка…</div>;
  return <SettingsBody store={store} onBack={onBack} />;
}

function SettingsBody({ store, onBack }: { store: AccountStore; onBack: () => void }) {
  useStore(store);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [muted, setMuted] = useState(sfx.muted);
  const [lighting, setLighting] = useState(gfx.lighting);
  const status = {
    off: 'выключено',
    syncing: 'синхронизация…',
    synced: 'сохранено в облаке',
    offline: 'нет связи с сервером',
    error: 'ошибка',
  }[store.cloud];
  return (
    <div class="screen settings" data-testid="settings">
      <h2>Настройки</h2>
      <button
        class="btn"
        onClick={() => {
          sfx.setMuted(!muted);
          setMuted(!muted);
        }}
      >
        Звук: {muted ? 'выключен' : 'включён'}
      </button>
      <button
        class="btn"
        data-testid="btn-lighting"
        onClick={() => {
          gfx.setLighting(!lighting);
          setLighting(!lighting);
        }}
      >
        Освещение: {lighting ? 'включено' : 'выключено'}
      </button>
      {lighting && <div class="settings__hint">Если игра тормозит — выключите освещение.</div>}
      <div class="panel settings__box">
        <div class="settings__title">Аккаунт</div>
        <div class="runend__text">
          Прогресс хранится на этом устройстве и в облаке (статус: <b>{status}</b>). Регистрация не
          нужна.
        </div>
        {code ? (
          <div class="recovery">
            <div class="recovery__code" data-testid="recovery-code">
              {code}
            </div>
            <div class="runend__text">
              Запишите или сохраните код. С ним можно перенести героев на другой телефон. Не
              показывайте его другим.
            </div>
            <button
              class="btn btn--small"
              onClick={() =>
                void copyText(code).then((ok) => setMsg(ok ? 'Скопировано' : 'Скопируйте вручную'))
              }
            >
              Скопировать
            </button>
          </div>
        ) : (
          <button
            class="btn"
            disabled={busy}
            data-testid="btn-get-code"
            onClick={() => {
              setBusy(true);
              void store.recoveryCode().then((c) => {
                setBusy(false);
                if (c) setCode(c);
                else setMsg('Сервер недоступен — попробуйте позже');
              });
            }}
          >
            Получить код восстановления
          </button>
        )}
        <div class="settings__title">Перенос с другого телефона</div>
        <div class="recovery__row">
          <input
            class="input"
            placeholder="XXXX-XXXX-XXXX"
            value={input}
            maxLength={16}
            onInput={(e) => setInput((e.target as HTMLInputElement).value)}
          />
          <button
            class="btn"
            disabled={busy || input.replace(/[\s-]/g, '').length < 12}
            onClick={() => setConfirm(true)}
          >
            Восстановить
          </button>
        </div>
        {msg && <div class="settings__msg">{msg}</div>}
      </div>
      <button class="btn btn--ghost" onClick={onBack}>
        Назад
      </button>
      {confirm && (
        <div class="overlay">
          <div class="panel">
            <h2>Заменить прогресс?</h2>
            <p class="runend__text">
              Герои на этом устройстве будут заменены героями из аккаунта по коду.
            </p>
            <button
              class="btn btn--primary"
              onClick={() => {
                setConfirm(false);
                setBusy(true);
                void store.recover(input).then((r) => {
                  setBusy(false);
                  setMsg(
                    {
                      ok: 'Готово! Прогресс восстановлен.',
                      not_found: 'Код не найден',
                      offline: 'Сервер недоступен',
                      rate_limited: 'Слишком много попыток, подождите час',
                    }[r],
                  );
                });
              }}
            >
              Да, заменить
            </button>
            <button class="btn" onClick={() => setConfirm(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
