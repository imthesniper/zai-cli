import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { NativeBackend } from '../src/backends/native.mjs';
import { validateConfig } from '../src/config.mjs';
import { formatNativeModel, matchesNativeModelSelection } from '../src/backends/native-contract.mjs';
const runtime = fileURLToPath(new URL('./fixtures/native-create-model.mjs', import.meta.url));
function make(t) {
  const events = [];
  const native = new NativeBackend({
    cwd: process.cwd(),
    config: validateConfig({ runtime: { command: process.execPath, args: [runtime] } }),
    emit: e => events.push(e), ask: async () => false,
  });
  t.after(() => native.dispose());
  return { native, events };
}
const selected = 'fixture-account/GLM-5.3';
test('exact unsuffixed account model binds at session/create without later setModel', async t => {
  const { native, events } = make(t);
  const result = await native.start(undefined, { initialModel: selected });
  assert.equal(result.needsModel, false);
  // Runtime is permitted to resolve default reasoning without changing identity.
  assert.equal(formatNativeModel(native.model), selected + '$standard');
  assert.equal(matchesNativeModelSelection(native.model, selected), true);
  await native.setModel(selected, { allowUnlistedExact: true });
  const before = await native.rpc.request('fixture/stats');
  assert.deepEqual(before, { createdWithModel: true, setModelCalls: 0, turns: 0 });
  await native.send('test no tools');
  assert.equal((await native.rpc.request('fixture/stats')).setModelCalls, 0);
  assert.ok(events.some(e => e.type === 'message' && e.role === 'assistant' &&
    e.text === 'Native initial model accepted.'));
});

test('failed initial model creation never falls back to another model or starts inference', async t => {
  const { native } = make(t);
  await assert.rejects(native.start(undefined, { initialModel: 'fixture-account/reject' }),
    error => error.code === -32602 && /rejected initial model/.test(error.message));
  assert.equal(native.model, undefined);
});
test('mismatched initial model cannot be accepted from session projection', async t => {
  const { native } = make(t);
  await assert.rejects(native.start(undefined, { initialModel: 'fixture-account/mismatch' }),
    /did not confirm the exact explicitly requested model/);
});
test('explicit reasoning selection is not silently discarded on session creation', async t => {
  const { native } = make(t);
  await assert.rejects(native.start(undefined, { initialModel: selected + '$standard' }),
    /cannot preserve an explicit reasoning level/);
  assert.equal(native.child, undefined);
});
test('resume cannot silently create or substitute a new model-bound conversation', async t => {
  const { native } = make(t);
  await assert.rejects(native.start('previous-session', { initialModel: selected }),
    /cannot replace an existing conversation model/);
  assert.equal(native.child, undefined);
});
test('native matcher accepts upstream default reasoning only when user omitted effort', () => {
  const actual = { providerId: 'fixture-account', modelId: 'GLM-5.3', options: { reasoningLevel: 'standard' } };
  assert.equal(matchesNativeModelSelection(actual, selected), true);
  assert.equal(matchesNativeModelSelection(actual, selected + '$standard'), true);
  assert.equal(matchesNativeModelSelection(actual, selected + '$high'), false);
  assert.equal(matchesNativeModelSelection(actual, 'fixture-account/other'), false);
  assert.equal(matchesNativeModelSelection(undefined, selected), false);
});
