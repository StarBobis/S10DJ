import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The desk keeps its data and stem audio outside the frontend bundle so the
 * extracted files stay where the Python tools put them. This middleware serves
 * `/data` and `/assets` straight from the repository root in dev and preview.
 */
function repoAssets(): Plugin {
  const types: Record<string, string> = {
    '.json': 'application/json',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };

  const serve = (req: { url?: string }, res: any, next: () => void) => {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/data/') && !url.startsWith('/assets/')) return next();
    const file = join(process.cwd(), normalize(url).replace(/^([/\\])+/, ''));
    if (!existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Accept-Ranges', 'bytes');
    createReadStream(file).pipe(res);
  };

  return {
    name: 'repo-assets',
    configureServer(server) {
      server.middlewares.use(serve);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve);
    },
  };
}

export default defineConfig({
  plugins: [vue(), repoAssets()],
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 8787,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome110',
  },
});
