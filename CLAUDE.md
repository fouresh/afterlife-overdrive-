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
pnpm build && pnpm e2e  # Playwright smoke (mobile emulation) против vite preview
pnpm sprites out.png    # нарисовать все спрайты в PNG (смотреть через Read)
pnpm format             # Prettier --write
node scripts/cf-deploy.mjs --env production --dry-run   # проверить бандл Worker'а
pnpm --filter @ao/server dev                            # wrangler dev (API + DO + D1 локально)
```

В облачной сессии Chromium уже установлен (`/opt/pw-browsers`), **не запускать**
`playwright install`. Версия `@playwright/test` закреплена `1.56.1` под этот браузер.
Скриншоты: тест сохраняет `test-results/**/game.png` — открыть через Read и посмотреть глазами.

## Структура

```
packages/shared   RNG (sfc32), dsin/dcos/datan2, BinWriter/BinReader, PlayerInput, константы
packages/content  палитра, спрайты (пиксельные карты), paper-doll, тайлсеты, (M1) предметы/враги
packages/procgen  Tile, DungeonFloor, генераторы биомов, (M1) граф комнат и валидатор
packages/sim      Entities (SoA), step(), коллизии, игроки, (M1) бой/ИИ/лут
apps/client       Vite + Preact UI + Pixi рендер; src/game (host, renderer, atlas, tilemap,
                  worldView, input), src/ui (экраны, контролы), src/core (ошибки, viewport, pwa),
                  src/i18n, build/ (pwa-плагин, иконки, PNG-энкодер)
apps/server       Worker: src/index.ts (роутинг), api.ts, room.ts (Durable Object),
                  migrations/*.sql (D1), wrangler.jsonc (production + env.preview)
scripts/          cf-deploy.mjs, check-bundle-size.mjs, sprite-sheet.ts, pr-preview-comment.cjs
e2e/              Playwright smoke
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
- Тест-хук: `window.__AO__ = { screen, state() }` — для Playwright и отчётов.
- Комментарии — по делу, на английском в коде; документация — на русском.

## Деплой

- `main` → Worker `afterlife-overdrive`, остальные ветки → `afterlife-overdrive-preview`.
- Секреты GitHub: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (инструкция:
  `docs/SETUP_CLOUDFLARE.md`). Без них deploy-джоб пропускается с notice, CI зелёный.
- D1 и поддомен workers.dev создаются скриптом; миграции — `apps/server/migrations/NNNN_*.sql`
  (только добавлять новые файлы, старые не менять).
- Новые классы Durable Objects → новый тег в `migrations` в `wrangler.jsonc` (и в env.preview).

## Состояние (обновлять в конце сессии)

- **Готово:** M0 (ветка `m0-foundation`, PR #1).
- **Дальше:** M1 — соло-забег (см. ROADMAP). Начинать с контент-схем и генератора крипты.
- **Известные ограничения:** документация Cloudflare (developers.cloudflare.com) не открывается
  из облачной сессии — лимиты сверены через веб-поиск (октябрь 2026).
