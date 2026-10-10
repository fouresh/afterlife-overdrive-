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
- Тест-хуки: `window.__AO__ = { screen, state() }`; с `?e2e=1` ещё `enterCombat()`, `grant()`,
  `finishFloor()` и бессмертие игрока. `?seed=N` фиксирует seed забега, `?debug=1` — оверлей.
- Скриншоты экранов: `e2e/screens.spec.ts` пишет `test-results/**/0N-*.png`.

## Как добавлять контент (без правок движка)

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

- **Готово:** M0 (ветка `m0-foundation`, PR #1), M1 (ветка `m1-solo-run`, PR #2).
- **GitHub Actions в репозитории не стартуют** (startup_failure даже у пустого workflow) —
  проблема настроек/биллинга аккаунта владельца, описано в PR #1. Пока проверяем всё локально.
- **Дальше:** M2 — персонаж и хаб: создатель персонажа (paper-doll уже есть), интро,
  хаб (склад, кузница, рынок, прокачка, портал), облачные сохранения + код восстановления.
  Профиль M1 (`localStorage` `ao.profile.v1`) нужно мигрировать.
- **Известные ограничения:** документация Cloudflare (developers.cloudflare.com) не открывается
  из облачной сессии — лимиты сверены через веб-поиск (октябрь 2026).
