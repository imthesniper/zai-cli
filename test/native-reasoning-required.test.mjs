import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../src/process.mjs';
import { NativeBackend } from '../src/backends/native.mjs';
import { parseNativeModel, formatNativeModel } from '../src/backends/native-contract.mjs';
import { validateConfig } from '../src/config.mjs';
const runtime = fileURLToPath(new URL('./fixtures/native-reasoning-runtime.mjs', import.meta.url));
const model = 'fixture-account/GLM-5.3';
function backend(t) {
  const seen = [];
  const app = new NativeBackend({ cwd: process.cwd(), config: validateConfig({
    runtime: { command: process.execPath, args: [runtime] },
  }), emit: e => seen.push(e), ask: async () => false });
  t.after(() => app.dispose());
  return { app, seen };
}
test('upstream-shaped mock refuses bare structured model; ZC resolves and sends advertised default', async t => {
  const { app, seen } = backend(t);
  const state = await app.start();
  assert.equal(state.needsModel, true);
  const options = await app.models();
  const defaultChoice = options.find(x => x.value === model);
  assert.equal(defaultChoice.disabled, false);
  assert.deepEqual(defaultChoice.selection, {
    providerId: 'fixture-account', modelId: 'GLM-5.3', options: { reasoningLevel: 'high' },
  });
  await assert.rejects(app.rpc.request('session/setModel', {
    sessionId: state.id, model: parseNativeModel(model),
    persistAsWorkspaceLastUsed: false,
  }), err => err.code === -32603);
  assert.equal((await app.rpc.request('fixture/stats')).failedSelections, 1);
  await app.setModel(model, { allowUnlistedExact: true });
  assert.equal(formatNativeModel(app.model), model + '$high');
  assert.equal((await app.rpc.request('fixture/stats')).failedSelections, 1);
  await app.send('Return only the fixture marker');
  assert.equal((await app.rpc.request('fixture/stats')).turns, 1);
  assert.ok(seen.some(e => e.role === 'assistant' && e.text === 'ZC_AUTH_LIFECYCLE_OK'));
});
test('explicit reasoning choice uses that level rather than the default', async t => {
  const { app } = backend(t);
  await app.start();
  await app.setModel(model + '$low');
  assert.equal(formatNativeModel(app.model), model + '$low');
  assert.equal((await app.rpc.request('fixture/stats')).reasoningLevel, 'low');
});
test('zc exec --model goes through unbound create and validated structured selection', async t => {
  const home = await mkdtemp(join(tmpdir(), 'zc-reasoning-cli-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const state = join(home, 'zc');
  await mkdir(state);
  await writeFile(join(state, 'config.json'), JSON.stringify({
    backend: 'native', mode: 'ask',
    runtime: { command: process.execPath, args: [runtime] },
  }));
  const bin = fileURLToPath(new URL('../bin/zc.mjs', import.meta.url));
  const out = await runProcess(process.execPath, [
    bin, 'exec', 'Reply only ZC_AUTH_LIFECYCLE_OK', '--trust',
    '--backend', 'native', '--model', model,
  ], { cwd: home, timeout: 20000, maxBytes: 16000,
    env: { ...process.env, ZC_HOME: state, ZAI_API_KEY: '' } });
  assert.equal(out.code, 0, out.output);
  assert.match(out.output, /ZC_AUTH_LIFECYCLE_OK/);
  assert.doesNotMatch(out.output, /Fixture requires an advertised reasoning level/);
});
