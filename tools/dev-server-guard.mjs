/**
 * Dev server launcher for `tauri dev`.
 *
 * Tauri always runs its `beforeDevCommand`; when a dev server is already
 * listening on the configured port (for example the one started with
 * `bun run dev` for browser checks) starting a second Vite instance fails with
 * "Port 8787 is already in use". This wrapper probes the port first and reuses
 * the running server, otherwise it starts Vite and forwards signals to it.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';

const HOST = process.env.DESK_DEV_HOST ?? '127.0.0.1';
const PORT = Number(process.env.DESK_DEV_PORT ?? 8787);

function probe(timeout = 800) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

if (await probe()) {
  console.log(`[dev] ${HOST}:${PORT} is already serving - reusing that dev server`);
  process.exit(0);
}

const child = spawn('bun', ['run', 'dev'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const stop = () => {
  if (!child.killed) child.kill();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('exit', stop);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
