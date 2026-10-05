/**
 * jsdom test environment with the optional `canvas` dependency forced off.
 *
 * jsdom does `require.resolve("canvas")` then an UNGUARDED `require("canvas")`.
 * The package resolves (Postiz depends on it) but its native binding isn't built
 * on every dev machine (and node v25 is outside canvas's supported engines), so
 * the require throws and jsdom init crashes. We make the *resolve* throw instead,
 * which flips jsdom's `canvasInstalled` to false — it then never requires canvas.
 * None of these tests render a real <canvas> (the fabric EditorCanvas is mocked).
 */
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'canvas') {
    const err = new Error("Cannot find module 'canvas' (disabled for frontend tests)");
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }
  return originalResolveFilename.call(this, request, ...rest);
};

module.exports = require('jest-environment-jsdom').default;
