import test from 'node:test';
import assert from 'node:assert/strict';
import { runProbe, failureKind } from '../scripts/native-auth-phase-probe.mjs';

const model = 'account:zai-individual-coding-plan/GLM-5.3';
function mock({ fail, emitReply = true, onInteraction } = {}) {
  return ({ emit, config }) => {
    assert.equal(config.mode, 'ask');
    const backend = {
      model: undefined,
      interaction: async (method, params) => onInteraction?.(method, params),
      async start() { if (fail === 'session_start') throw new Error('unidentified private error'); },
      async models() {
        if (fail === 'model_catalog') throw new Error('Private catalog error');
        return [{ value: model, disabled: false }];
      },
      async setModel() {
        if (fail === 'model_select') throw new Error('model select failed');
        this.model = { providerId: 'account:zai-individual-coding-plan', modelId: 'GLM-5.3' };
      },
      async send() {
        if (fail === 'request') throw new Error('request failed without raw diagnostics');
        if (emitReply) emit({ type: 'message', role: 'assistant', text: 'ZC_AUTH_LIFECYCLE_OK' });
      },
      async dispose() {},
    };
    return backend;
  };
}
test('native phase diagnostic returns verified success with no raw response or credential', async () => {
  const result = await runProbe({ cwd: process.cwd(), model, makeBackend: mock() });
  assert.equal(result.category, 'SUCCESS'); assert.equal(result.responseVerified, true);
  assert.equal(result.phase, 'response'); assert.equal(result.selected, true);
  assert.ok(!JSON.stringify(result).includes('Bearer '));
});
test('native phase diagnostic identifies each local failure boundary', async () => {
  for (const phase of ['session_start', 'model_catalog', 'model_select', 'request']) {
    const result = await runProbe({ cwd: process.cwd(), model, makeBackend: mock({ fail: phase }) });
    assert.equal(result.phase, phase); assert.equal(result.responseVerified, false);
    assert.equal(result.category, 'OTHER');
    assert.equal('error' in result, false);
  }
});
test('missing marker is not accepted as a successful model request', async () => {
  const result = await runProbe({ cwd: process.cwd(), model, makeBackend: mock({ emitReply: false }) });
  assert.equal(result.phase, 'response'); assert.equal(result.category, 'OTHER');
  assert.equal(result.responseVerified, false);
});
test('auth headers are only counted, never printed', async () => {
  const result = await runProbe({ cwd: process.cwd(), model, makeBackend: options => {
    const instance = mock()(options);
    instance.start = async () => { await instance.interaction('interaction/requestProviderRuntimeHeaders', { requestAuth: { apiKey: 'do-not-disclose' } }); };
    return instance;
  } });
  assert.equal(result.providerHeaderRequests, 1);
  assert.doesNotMatch(JSON.stringify(result), /do-not-disclose/);
});
test('classifications contain only fixed nonsecret reason codes', () => {
  const secret = 'fixture-secret-here';
  for (const message of ['project_token_login_failed', '401 unauthorized', secret, 'The runtime marked this model unavailable']) {
    assert.doesNotMatch(failureKind(new Error(message)), /fixture-secret/);
  }
  assert.equal(failureKind(new Error('project_token_login_failed')), 'PROJECT_TOKEN_LOGIN_FAILED');
  assert.equal(failureKind(new Error('model is unavailable')), 'MODEL_SELECTION');
});

test('phase probe separates upstream RPC rejection from model projection mismatch', async () => {
  const rejected = await runProbe({ cwd: process.cwd(), model, makeBackend: ({emit}) => ({
    rpc: { request: async method => { if (method === 'session/setModel') throw new Error('classified privately'); return {}; } },
    interaction: async () => {},
    async start() {},
    async models() { return [{value:model,disabled:false}]; },
    async setModel() { await this.rpc.request('session/setModel',{model}); },
    async dispose() {},
  }) });
  assert.equal(rejected.phase,'model_select');
  assert.equal(rejected.setModelRpcSent,true);
  assert.equal(rejected.setModelRpcRejected,true);
  assert.equal(rejected.setModelRpcAcknowledged,false);
  assert.doesNotMatch(JSON.stringify(rejected), /classified privately/);

  const acknowledged = await runProbe({ cwd: process.cwd(), model, makeBackend: () => ({
    rpc: { request: async method => (method==='session/setModel' ? {ok:true} : {}) },
    interaction: async () => {},
    async start() {},
    async models() { return [{value:model,disabled:false}]; },
    async setModel() {
      await this.rpc.request('session/setModel',{model});
      throw new Error('a secret local snapshot error');
    },
    async dispose() {},
  }) });
  assert.equal(acknowledged.phase,'model_select');
  assert.equal(acknowledged.setModelRpcSent,true);
  assert.equal(acknowledged.setModelRpcAcknowledged,true);
  assert.equal(acknowledged.setModelRpcRejected,false);
  assert.doesNotMatch(JSON.stringify(acknowledged), /secret/);
});
test('phase probe identifies matching model at startup without emitting selection contents', async () => {
  const result = await runProbe({cwd:process.cwd(),model, makeBackend: options=>{
    const f = mock()(options);
    f.start = async () => { f.model = {providerId:'account:zai-individual-coding-plan',modelId:'GLM-5.3'}; };
    return f;
  }});
  assert.equal(result.selectedAtStart,true);
  assert.equal(result.category,'SUCCESS');
  assert.equal('model' in result,false);
});
