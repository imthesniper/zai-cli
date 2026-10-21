import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { NativeBackend } from '../src/backends/native.mjs';
import { validateConfig } from '../src/config.mjs';

const fixture = fileURLToPath(new URL('./fixtures/native-refresh-lifecycle.mjs', import.meta.url));
const model = 'fixture-account/GLM-5.3';
const config = validateConfig({ runtime: { command: process.execPath, args: [fixture] }, mode: 'ask' });

test('controlled fake expiry renews without ZC replaying the user prompt or exposing fake secrets', async t => {
  const events = [];
  const app = new NativeBackend({
    cwd: process.cwd(), config, emit: event => events.push(event), ask: async () => false,
  });
  t.after(() => app.dispose());
  await app.start();
  await app.setModel(model);
  await app.send('first short-lived fixture request');
  let stats = await app.rpc.request('fixture/stats', {});
  assert.equal(stats.issueCount, 1);
  assert.equal(stats.refreshAttempts, 0);
  assert.equal(stats.completions, 1);

  // Expire only the fake issuer's clock. Real credentials and OS time are untouched.
  await app.rpc.request('fixture/advance', { seconds: 11 });
  await app.send('second short-lived fixture request');
  stats = await app.rpc.request('fixture/stats', {});
  assert.deepEqual({
    issueCount: stats.issueCount,
    refreshAttempts: stats.refreshAttempts,
    successfulRefreshes: stats.successfulRefreshes,
    submissions: stats.submissions,
    completions: stats.completions,
    maxSubmissionsPerInputId: stats.maxSubmissionsPerInputId,
  }, {
    issueCount: 2, refreshAttempts: 1, successfulRefreshes: 1,
    submissions: 2, completions: 2, maxSubmissionsPerInputId: 1,
  });
  assert.ok(events.some(x => x.type === 'message' && x.role === 'assistant' && x.text === 'FIXTURE_REFRESH_OK_2'));
  assert.doesNotMatch(JSON.stringify(events), /private-fixture-token-|accessToken|authorization/i);
});

test('failed fake issuer renewal is surfaced once without silent retry, fallback, or prompt replay', async t => {
  const events = [];
  const app = new NativeBackend({
    cwd: process.cwd(), config, emit: event => events.push(event), ask: async () => false,
  });
  t.after(() => app.dispose());
  await app.start();
  await app.setModel(model);
  await app.send('before forced mock expiry');
  await app.rpc.request('fixture/advance', { seconds: 11 });
  await app.rpc.request('fixture/rejectNextRefresh', {});
  await assert.rejects(app.send('the rejected renewal request'), /Simulated token refresh rejected/);
  const stats = await app.rpc.request('fixture/stats', {});
  assert.equal(stats.refreshAttempts, 1);
  assert.equal(stats.successfulRefreshes, 0);
  assert.equal(stats.submissions, 2);
  assert.equal(stats.completions, 1);
  assert.equal(stats.failures, 1);
  assert.equal(stats.maxSubmissionsPerInputId, 1);
  assert.equal(events.filter(x => x.type === 'message' && x.role === 'user').length, 2);
  assert.ok(!events.some(x => x.type === 'message' && x.text === 'FIXTURE_REFRESH_OK_2'));
  assert.equal(app.active, undefined);
});
