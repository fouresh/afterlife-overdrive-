#!/usr/bin/env node
/**
 * Cloudflare deploy for CI (no manual steps besides the two GitHub secrets).
 *
 *   node scripts/cf-deploy.mjs --env production|preview [--url-only]
 *
 * 1. Without CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID: prints a notice and exits 0 (skip).
 * 2. Ensures a workers.dev subdomain exists (creates one if the account has none).
 * 3. Ensures the D1 database exists (creates it), writes apps/server/wrangler.deploy.jsonc with
 *    the real database_id.
 * 4. Applies D1 migrations, deploys the Worker (static client + API + Durable Objects).
 * 5. Smoke-checks /api/health and exposes `url` as a GitHub step output.
 * --url-only: only resolve and print the URL (used to comment the preview link on new PRs).
 * --dry-run: no Cloudflare account needed; validates config + bundles the Worker (runs in CI).
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const envName = args[args.indexOf('--env') + 1] === 'preview' ? 'preview' : 'production';
const urlOnly = args.includes('--url-only');
const dryRun = args.includes('--dry-run');
const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
const account = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
const serverDir = 'apps/server';
const WORKER = envName === 'production' ? 'afterlife-overdrive' : 'afterlife-overdrive-preview';
const DB_NAME = WORKER;

function output(key, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}
function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
}
function fail(msg) {
  console.error(`::error::${msg}`);
  summary(
    `### ❌ Деплой не удался\n\n${msg}\n\nСм. docs/SETUP_CLOUDFLARE.md (раздел «Если что-то пошло не так»).`,
  );
  process.exit(1);
}

if (dryRun) {
  writeDeployConfig('00000000-0000-0000-0000-000000000000');
  wrangler(
    'deploy',
    '--dry-run',
    '--outdir',
    '.wrangler/dry-run',
    '--define',
    '__BUILD_SHA__:"dryrun"',
  );
  console.log('Worker bundle OK (dry run).');
  process.exit(0);
}

if (!token || !account) {
  const msg =
    'Секреты Cloudflare не настроены (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID) — деплой пропущен. Инструкция: docs/SETUP_CLOUDFLARE.md';
  console.log(`::notice title=Deploy skipped::${msg}`);
  summary(`### ⏭️ Деплой пропущен\n\n${msg}`);
  output('url', '');
  output('skipped', 'true');
  process.exit(0);
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = { success: false, errors: [{ message: `HTTP ${res.status}` }] };
  }
  return { status: res.status, ...body };
}

function errText(r) {
  return (
    (r.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ') ||
    `HTTP ${r.status}`
  );
}

async function ensureSubdomain() {
  const r = await api(`/accounts/${account}/workers/subdomain`);
  if (r.success && r.result?.subdomain) return r.result.subdomain;
  if (urlOnly) fail(`Нет поддомена workers.dev: ${errText(r)}`);
  const name = `afterlife-${account.slice(0, 8).toLowerCase()}`;
  console.log(`Creating workers.dev subdomain "${name}"…`);
  const c = await api(`/accounts/${account}/workers/subdomain`, {
    method: 'PUT',
    body: JSON.stringify({ subdomain: name }),
  });
  if (!c.success) {
    fail(
      `Не удалось создать поддомен workers.dev (${errText(c)}). Откройте dash.cloudflare.com → Workers & Pages один раз, чтобы Cloudflare создал его, и перезапустите workflow.`,
    );
  }
  return c.result.subdomain;
}

async function ensureDatabase() {
  const list = await api(`/accounts/${account}/d1/database?name=${encodeURIComponent(DB_NAME)}`);
  if (!list.success)
    fail(`Нет доступа к D1 (${errText(list)}). Проверьте право «D1: Edit» у токена.`);
  const found = (list.result ?? []).find((d) => d.name === DB_NAME);
  if (found) return found.uuid;
  console.log(`Creating D1 database "${DB_NAME}"…`);
  const c = await api(`/accounts/${account}/d1/database`, {
    method: 'POST',
    body: JSON.stringify({ name: DB_NAME }),
  });
  if (!c.success) fail(`Не удалось создать базу D1 (${errText(c)}).`);
  return c.result.uuid;
}

/** Strip // and /* *\/ comments from JSONC (string-aware). */
function stripJsonc(src) {
  let out = '';
  let inStr = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inStr) {
      out += ch;
      if (ch === '\\') out += src[++i];
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i++;
    } else out += ch;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function writeDeployConfig(dbId) {
  const cfg = JSON.parse(stripJsonc(readFileSync(join(serverDir, 'wrangler.jsonc'), 'utf8')));
  const target = envName === 'preview' ? cfg.env.preview : cfg;
  for (const d of target.d1_databases) d.database_id = dbId;
  delete cfg.$schema;
  writeFileSync(join(serverDir, 'wrangler.deploy.jsonc'), JSON.stringify(cfg, null, 2));
}

function wrangler(...wargs) {
  const full = [...wargs, '--config', 'wrangler.deploy.jsonc'];
  if (envName === 'preview') full.push('--env', 'preview');
  console.log(`$ wrangler ${full.join(' ')}`);
  const r = spawnSync('pnpm', ['exec', 'wrangler', ...full], {
    cwd: serverDir,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
  });
  process.stdout.write(r.stdout ?? '');
  process.stderr.write(r.stderr ?? '');
  if (r.status !== 0)
    fail(`wrangler ${wargs[0]} завершился с ошибкой (код ${r.status}). Подробности — в логе шага.`);
  return `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
}

const subdomain = await ensureSubdomain();
const url = `https://${WORKER}.${subdomain}.workers.dev`;
if (urlOnly) {
  console.log(url);
  output('url', url);
  process.exit(0);
}

const dbId = await ensureDatabase();
writeDeployConfig(dbId);
wrangler('d1', 'migrations', 'apply', 'DB', '--remote');
const sha = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);
const out = wrangler('deploy', '--define', `__BUILD_SHA__:"${sha}"`);
const printed = out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i)?.[0] ?? url;

// Health check (the new version can take a few seconds to propagate).
let health = 'unknown';
for (let i = 0; i < 10; i++) {
  try {
    const r = await fetch(`${printed}/api/health`);
    if (r.ok) {
      const j = await r.json();
      health = `ok (db: ${j.db}, build: ${j.build})`;
      if (j.build === sha) break;
    } else health = `HTTP ${r.status}`;
  } catch (e) {
    health = String(e);
  }
  await new Promise((r) => setTimeout(r, 3000));
}

output('url', printed);
output('skipped', 'false');
const label = envName === 'production' ? 'Продакшен' : 'Превью';
summary(`### 🚀 ${label}: ${printed}\n\nКоммит \`${sha}\`, health: ${health}`);
console.log(`Deployed ${envName}: ${printed} — health: ${health}`);
