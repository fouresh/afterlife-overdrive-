import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { pwaPlugin } from './build/pwa';

const rootPkg = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as {
  version: string;
};

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
    __BUILD_SHA__: JSON.stringify(gitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  build: {
    target: 'es2022',
    manifest: true,
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    reportCompressedSize: false,
  },
  server: {
    host: true,
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
  preview: {
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
  plugins: [pwaPlugin()],
});
