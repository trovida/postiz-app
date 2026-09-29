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
const LISTEN_MAX_ATTEMPTS = 5;
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = process.env.ORCHESTRATOR_PORT || 3002;
  await listenWithRetry(app, port);
  console.log(`Orchestrator health check listening on port ${port}`);
}


bootstrap();
