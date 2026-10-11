# CLAUDE.md — память проекта между сессиями

Afterlife Overdrive — пиксельная кооп-roguelite (до 4 игроков) для мобильного браузера.
Владелец работает **только с телефона**: GitHub + сессии Claude. Всё собирается, тестируется и
деплоится через GitHub Actions. Язык общения и документации — русский.

## Как работать

- Работаем этапами (см. `docs/ROADMAP.md`). Этап = ветка `mN-короткое-имя` от предыдущей →
  все проверки зелёные локально → коммит → push → PR в `main` с описанием и чеклистом
  «как проверить на телефоне». Владелец мержит сам (**merge commit**, не squash).
- Вопросы владельцу — только если решение действительно за ним. Иначе выбрать разумный вариант
  и записать в `docs/DECISIONS.md` (решение + почему).
- В конце сессии обновить `docs/ROADMAP.md`, `CHANGELOG.md` и раздел «Состояние» ниже.
- Перед push: `pnpm check` (lint, format, typecheck, unit, build, size) и `pnpm e2e`.
- Никаких внешних ассетов: графика и звук — кодом; шрифты — из `@fontsource`.
- Никаких платных сервисов и сервисов с банковской картой.

## Команды

```bash
pnpm install            # зависимости (pnpm 10, Node 22)
pnpm dev                # клиент на http://localhost:5173 (?debug=1 — оверлей)
pnpm check              # lint + format:check + typecheck + test + build + size
pnpm test               # Vitest (все пакеты)
pnpm build && pnpm e2e  # Playwright: smoke/screens против vite preview + multiplayer против
                        # wrangler dev (поднимается сам: миграции D1 --local + dev на :8787)
pnpm sprites out.png    # нарисовать все спрайты в PNG (смотреть через Read)
pnpm floor-map 42 2 f.png  # нарисовать сгенерированный этаж (seed, глубина) в PNG
pnpm format             # Prettier --write
node scripts/cf-deploy.mjs --env production --dry-run   # проверить бандл Worker'а
pnpm --filter @ao/server dev                            # wrangler dev (API + DO + D1 локально)
```

В облачной сессии Chromium уже установлен (`/opt/pw-browsers`), **не запускать**
`playwright install`. Версия `@playwright/test` закреплена `1.56.1` под этот браузер.
Скриншоты: тест сохраняет `test-results/**/game.png` — открыть через Read и посмотреть глазами.

## Структура

```
packages/shared   RNG (sfc32), dsin/dcos/datan2, BinWriter/BinReader, PlayerInput, names (фильтр),
                  net.ts (типы бинарных сообщений, пакет изменений ввода)
packages/content  палитра, спрайты, paper-doll, тайлсеты (crypt, forest), данные (оружие, броня,
                  артефакты, аффиксы, враги, биомы, комнаты, хаб, npcs, story — задания,
                  диалоги, правила реплик), zod-схемы, русские строки (i18n/ru.ts, story-ru.ts)
packages/procgen  Tile, DungeonFloor, BSP-крипта, лес (layout-glades), роли комнат, наполнение
                  (декор, свет, пленники), валидатор, хаб
packages/sim      Entities (SoA), step(), бой/ИИ/лут; save.ts (схема сохранения v2),
                  account.ts (операции хаба, итоги забега), economy.ts, progression.ts,
                  story.ts (события забега, задания, диалоги, миграция старых героев),
                  net/ (snapshot.ts — дельта-снапшоты, inputs.ts — InputQueue/Predictor,
                  protocol.ts — JSON-сообщения комнаты + zod, mirror.ts — зеркальный мир)
apps/client       Vite + Preact UI + Pixi рендер; src/game (host, renderer, atlas, tilemap,
                  worldView, fx, input), src/ui (экраны; ui/game — герои, хаб, панели, забег),
                  src/state (IndexedDB, синхронизация аккаунта), src/audio (процедурные звуки),
                  src/net (party.ts — отряд/WebSocket/переподключение, netrun.ts — сетевой забег),
                  src/core (ошибки, viewport, pwa), src/i18n, build/ (pwa-плагин, иконки, PNG)
apps/server       Worker: src/index.ts, api.ts (аккаунт, сохранения, runs, rooms), crypto.ts,
                  room-core.ts (логика комнаты без Cloudflare), room.ts (Durable Object),
                  migrations/*.sql (D1), test/ (API на node:sqlite, RoomCore),
                  wrangler.jsonc (production + env.preview)
scripts/          cf-deploy.mjs, check-bundle-size.mjs, sprite-sheet.ts, floor-map.ts
e2e/              Playwright: smoke (герой → хаб → данж → бой), screens (тур со скриншотами),
                  multiplayer (2 контекста: отряд по ссылке → кооп-забег → обрыв связи → хаб)
docs/             GDD, ARCHITECTURE, ROADMAP, DECISIONS, SETUP_CLOUDFLARE
```

## Правила кода

- TypeScript strict. Пакеты экспортируют исходники (`exports: ./src/index.ts`), сборки пакетов нет.
- **Детерминизм в `packages/*`:** нельзя `Math.random/sin/cos/atan2/pow/...`, `Date`,
  `performance`, `setTimeout`, DOM — ESLint упадёт. Используйте `Rng`, `dsin/dcos/datan2`,
  `ipow` из `@ao/shared`. Время — только тики (`TICK_RATE = 30`, `secToTicks`).
- Горячие циклы sim/рендера без аллокаций: typed arrays, пулы, переиспользование объектов.
- Enum'ы не используем — `as const` объекты + union-типы (`Kind`, `Tile`, `Ev`, `Btn`).
- Все строки UI через `t('key')` (`apps/client/src/i18n/ru.ts`); контентные строки — ключи.
- Контент — данные: новый предмет/враг/биом = новый файл в `packages/content`, движок не трогаем.
- Спрайты: `sprite(id, w, h, palette, frames)`; `.` — прозрачный; значения палитры —
  цвет `#rrggbb` или слот `@skin/@hair/@cloth/@m0..m2…`. Замена на PNG:
  `apps/client/src/assets/sprite-overrides/<id>.png` (кадры по горизонтали).
- Новый спрайт → добавить в реестр (`packages/content/src/registry.ts`), тест проверит размеры.
- Бюджет бандла — `bundle-budget.json`; меню/редкие экраны грузить через `import()`.
- Тест-хуки: `window.__AO__ = { screen, state() }`; с `?e2e=1` ещё `enterCombat()`, `grant()`,
  `finishFloor()` (на последнем этаже — с событием `clear:<биом>`), `rescue()` (освободить
  пленника этажа), `talk(stationId)` (открыть панель без диалога), `dropNet()` (разрыв
  WebSocket в кооп-забеге) и бессмертие игрока в соло. Новый герой в e2e сначала видит диалог
  пробуждения — `createHero` его пропускает. `?seed=N` фиксирует seed забега,
  `?debug=1` — оверлей. Хелперы e2e — `e2e/helpers.ts` (`createHero`, `enterDungeon`).
- Python-замены в файлах после Prettier часто молча не срабатывают (переносы строк) —
  проверяйте `assert old in s` или используйте Edit.
- Скриншоты экранов: `e2e/screens.spec.ts` пишет `test-results/**/0N-*.png`,
  мультиплеер — `test-results/**/mp-*.png`.
- Сеть: любое новое поле, нужное клиенту для отрисовки, добавляется в `KIND_FIELDS`/
  `quantize`/`writeEntity` (snapshot.ts) — тест `net.test.ts` проверяет зеркало побитно.
  Логику комнаты менять в `room-core.ts` и тестировать `apps/server/test/room.test.ts`.
- `pkill -f "wrangler dev"` в Bash убивает и саму команду (совпадает строка) — не использовать;
  Playwright сам поднимает и гасит wrangler dev.

## Как добавлять контент (без правок движка)

- Сюжет: задание — запись в `data/story.ts` (`QUESTS`, цель = событие `clear:<биом>`,
  `rescue:<npc>`, `boss:<враг>`), диалог — `DIALOGS` + тексты в `i18n/story-ru.ts`, когда он
  звучит — `STORY_RULES`. Пленник — `captives` у биома. Тест `content.test.ts` проверит связи.
- Биом: `data/biomes.ts` (генератор `bsp`/`glades`, враги, этажи, `requires` — флаг доступа),
  тайлсет в `tilesets.ts`, спрайты тайлов в `sprites/tiles-<биом>.ts` (можно генерировать
  кодом, см. лес), шаблоны комнат с `biomes: [...]`. `pnpm floor-map 42 1 f.png forest`.

- Оружие: запись в `packages/content/src/data/weapons.ts` (архетип атаки + спрайт в руке из
  `sprites/items.ts`). Снаряд — в `data/projectiles.ts`.
- Броня: `data/armor.ts` (форма слоя paper-doll + материал из `MATERIALS`).
- Артефакт: `data/artifacts.ts` — список эффектов; иконка — `rune(...)` в `sprites/items.ts`.
- Враг: `data/enemies.ts` (движение + атаки) + спрайт в `sprites/enemies.ts` + добавить в пул
  биома `data/biomes.ts`. Шаблон комнаты: `data/rooms.ts` (ASCII).
- Русские названия: `packages/content/src/i18n/ru.ts`. Тест `content.test.ts` проверит
  схемы, ссылки на спрайты/снаряды и наличие строк.
- Комментарии — по делу, на английском в коде; документация — на русском.

## Деплой

- `main` → Worker `afterlife-overdrive`, остальные ветки → `afterlife-overdrive-preview`.
- Секреты GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (инструкция:
  `docs/SETUP_CLOUDFLARE.md`). Без них deploy-джоб пропускается с notice, CI зелёный.
- D1 и поддомен workers.dev создаются скриптом; миграции — `apps/server/migrations/NNNN_*.sql`
  (только добавлять новые файлы, старые не менять).
- Новые классы Durable Objects → новый тег в `migrations` в `wrangler.jsonc` (и в env.preview).

## Состояние (обновлять в конце сессии)

- **Готово:** M0 (`m0-foundation`, PR #1), M1 (`m1-solo-run`, PR #2), M2 (`m2-character-hub`,
  PR #3), M3 (`m3-multiplayer`, PR #4), M4 (`m4-story-chapter1`, PR #5). Ветки цепочкой:
  каждая следующая сделана от предыдущей; мержить по порядку через merge commit.
- **GitHub Actions в репозитории не стартуют** (startup_failure даже у пустого workflow) —
  проблема настроек/биллинга аккаунта владельца, описано в PR #1. Пока проверяем всё локально.
- **Дальше:** M5 — техноруины (модульная сетка) и/или глава 2 (Гномьи шахты, пещеры на
  клеточных автоматах), английский язык (второй словарь), музыка, баланс, аукцион. Мелкие
  хвосты M3/M4 — в ROADMAP.
- **Известные ограничения:** документация Cloudflare (developers.cloudflare.com) не открывается
  из облачной сессии — лимиты сверены через веб-поиск (октябрь 2026). Кооп-забег не
  возобновляется после перезагрузки страницы (место держится 45 с, но клиент его не помнит).
