import { initializeSentry } from '@gitroom/nestjs-libraries/sentry/initialize.sentry';
initializeSentry('orchestrator', true);
import 'source-map-support/register';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@gitroom/orchestrator/app.module';
import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

// On `pm2 restart orchestrator` the replacement process can try to bind the
// health port before the outgoing process has released it, so a bare
// app.listen() throws EADDRINUSE and the process dies (ELIFECYCLE) until pm2
// retries into a free port — briefly running two instances and logging a scary
// error. Retry the bind a few times so the new process simply waits for the old
// one to let go. Graceful drain is already handled by enableShutdownHooks(),
// which closes the HTTP server (releasing the port) during app.close().
// The retry window (attempts * delay) must comfortably outlast
// SHUTDOWN_TIMEOUT_MS below, so the incoming process is still retrying when the
// outgoing one force-exits and frees the port. 10 * 1500ms = 15s > 8s.
const LISTEN_MAX_ATTEMPTS = 10;
const LISTEN_RETRY_DELAY_MS = 1500;

async function listenWithRetry(
  app: INestApplication,
  port: number | string
): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await app.listen(port);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EADDRINUSE' && attempt < LISTEN_MAX_ATTEMPTS) {
        console.warn(
          `Orchestrator port ${port} in use (EADDRINUSE); attempt ${attempt}/${LISTEN_MAX_ATTEMPTS}, retrying in ${LISTEN_RETRY_DELAY_MS}ms`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, LISTEN_RETRY_DELAY_MS)
        );
        continue;
      }
      throw err;
    }
  }
}

// Graceful shutdown that ALWAYS exits (and thus releases the health port) even
// if the Temporal worker drain hangs. Without a forced exit, a stop signal
// leaves the process alive — its Temporal workers keep the event loop busy — so
// it never releases :3002; the replacement then can't bind (EADDRINUSE) and pm2
// crash-loops, accumulating zombie workers. We attempt a clean app.close()
// (runs Nest lifecycle hooks + drains workers) but fall back to process.exit
// after a timeout so the port is always freed promptly. This replaces
// enableShutdownHooks() (whose signal handlers call app.close() but never force
// exit on a hang).
const SHUTDOWN_TIMEOUT_MS = Number(
  process.env.ORCHESTRATOR_SHUTDOWN_TIMEOUT_MS || 8000
);

function installGracefulShutdown(app: INestApplication) {
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Orchestrator received ${signal}, shutting down...`);
    const force = setTimeout(() => {
      console.warn(
        `Orchestrator shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`
      );
      process.exit(0);
    }, SHUTDOWN_TIMEOUT_MS);
    force.unref();
    app
      .close()
      .catch((err) => console.error('Error during orchestrator shutdown', err))
      .finally(() => {
        clearTimeout(force);
        process.exit(0);
      });
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => shutdown(signal));
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  installGracefulShutdown(app);
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await listenWithRetry(app, port);
  console.log(`Orchestrator health check listening on port ${port}`);
}


bootstrap();
