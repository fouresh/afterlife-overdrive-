#!/usr/bin/env node
/**
 * Bundle size budget check. Reads the Vite manifest, computes gzip sizes of:
 *  - initialJs/initialCss: what the browser loads before the main menu is interactive,
 *  - gameJs: the lazily loaded game screen (Pixi + sim) with its static imports,
 *  - totalJs: every JS file in the build.
 * Fails (exit 1) when a budget in bundle-budget.json is exceeded. Writes a table to the GitHub
 * job summary when running in Actions.
 */
import { appendFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = 'apps/client/dist';
const manifest = JSON.parse(readFileSync(join(dist, '.vite/manifest.json'), 'utf8'));
const budget = JSON.parse(readFileSync('bundle-budget.json', 'utf8'));

const gz = (file) => gzipSync(readFileSync(join(dist, file)), { level: 9 }).length / 1024;

function collect(key, seen = new Set()) {
  const chunk = manifest[key];
  if (!chunk || seen.has(key)) return seen;
  seen.add(key);
  for (const imp of chunk.imports ?? []) collect(imp, seen);
  return seen;
}

const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
const initialKeys = collect(entryKey);
const initialJs = [...initialKeys].reduce((s, k) => s + gz(manifest[k].file), 0);
const initialCss = [...initialKeys]
  .flatMap((k) => manifest[k].css ?? [])
  .filter((f, i, a) => a.indexOf(f) === i)
  .reduce((s, f) => s + gz(f), 0);

const gameKey = Object.keys(manifest).find((k) => /GameRoot|GameScreen/.test(k));
const gameKeys = gameKey ? collect(gameKey) : new Set();
for (const k of initialKeys) gameKeys.delete(k);
const gameJs = [...gameKeys].reduce((s, k) => s + gz(manifest[k].file), 0);

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const totalJs = walk(dist)
  .filter((f) => f.endsWith('.js'))
  .reduce((s, f) => s + gzipSync(readFileSync(f), { level: 9 }).length / 1024, 0);

const rows = [
  ['initialJs', initialJs],
  ['initialCss', initialCss],
  ['gameJs', gameJs],
  ['totalJs', totalJs],
];
let failed = false;
const lines = ['| bundle | gzip KB | budget KB | |', '|---|---:|---:|---|'];
for (const [name, value] of rows) {
  const limit = budget[name];
  const ok = value <= limit;
  if (!ok) failed = true;
  lines.push(`| ${name} | ${value.toFixed(1)} | ${limit} | ${ok ? '✅' : '❌'} |`);
}
console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Bundle size\n\n${lines.join('\n')}\n`);
}
if (failed) {
  console.error('\nBundle size budget exceeded. See bundle-budget.json.');
  process.exit(1);
}
