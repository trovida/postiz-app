#!/usr/bin/env node
/**
 * Guard: make.is.ts + make.secure.id.ts are bundled into the Temporal WORKFLOW
 * sandbox, where Node's `crypto` is a disallowed module. A Node crypto import
 * in either file crash-loops the orchestrator worker (the webpack workflow
 * bundler rejects it) and SILENTLY freezes all publishing — every post sticks
 * in Post.state=QUEUE with no error. They must use isomorphic Web Crypto
 * (globalThis.crypto.getRandomValues). See POSTIZ_TIER1_RUNBOOK.md.
 *
 * This runs in Dockerfile.dev before the build, so a regression fails the image
 * build (the deploy path) rather than reaching production. Also exposed as
 * `pnpm run check:crypto-isomorphic`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'libraries/nestjs-libraries/src/services/make.is.ts',
  'libraries/nestjs-libraries/src/services/make.secure.id.ts',
];

// Strip block and line comments so a comment that merely *mentions* crypto
// (e.g. "do NOT import 'crypto'") is never a false positive.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// Matches an actual ES import or CJS require of Node's crypto (bare or node:).
const NODE_CRYPTO =
  /(?:import[\s\S]*?from\s*|require\(\s*)['"](?:node:)?crypto['"]/;

let failed = false;
for (const rel of FILES) {
  let code;
  try {
    code = readFileSync(join(root, rel), 'utf8');
  } catch (err) {
    console.error(`check-workflow-safe-crypto: cannot read ${rel}: ${err.message}`);
    failed = true;
    continue;
  }
  if (NODE_CRYPTO.test(stripComments(code))) {
    console.error(
      `\n✗ ${rel} imports Node 'crypto'.\n` +
        `  This file reaches the Temporal workflow sandbox; a Node crypto import\n` +
        `  crash-loops the orchestrator worker and freezes ALL publishing (posts\n` +
        `  stick in QUEUE). Use isomorphic Web Crypto:\n` +
        `      globalThis.crypto.getRandomValues(new Uint8Array(n))\n` +
        `  See POSTIZ_TIER1_RUNBOOK.md.\n`
    );
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  'check-workflow-safe-crypto: OK (make.is / make.secure.id are Web-Crypto isomorphic)'
);
