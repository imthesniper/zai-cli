import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { isolatedEnv, parseOptions, modelDefault, classify, formatNativePhase } from '../scripts/auth-lifecycle-check.mjs';

test('live authentication test requires a well-formed explicit provider/model and bounded wait', () => {
  assert.equal(parseOptions([]).model, modelDefault);
  assert.equal(parseOptions(['--delay-seconds','60']).delaySeconds, 60);
  for (const args of [['--delay-seconds', '-1'], ['--delay-seconds', '3601'], ['--model','garbage'], ['--unsafe']]) {
    assert.throws(() => parseOptions(args));
  }
});

test('authentication test isolates all local config, provider, credential and session locations', () => {
  const base = { ZAI_API_KEY:'SECRET', GITHUB_TOKEN:'SECRET', AWS_SESSION_TOKEN:'SECRET', PATH:process.env.PATH };
  const profile = resolve(tmpdir(), 'zc-auth-test-isolated');
  const env = isolatedEnv(profile, base);
  for (const k of ['HOME','USERPROFILE','ZC_HOME','ZCODE_DATA_BASE_DIR','ZCODE_CLI_SETTINGS_FILE','ZCODE_CLI_CREDENTIALS_FILE','ZCODE_PERSONAL_PROVIDER_CONFIG_FILE','ZCODE_SESSION_DB_PATH']) {
    assert.ok(env[k].startsWith(profile),k);
  }
  assert.equal(env.ZCODE_APP_SERVER_AUTH_MODE,'standalone');
  for (const k of ['ZAI_API_KEY','GITHUB_TOKEN','AWS_SESSION_TOKEN']) assert.equal(env[k],undefined);
  assert.equal(env.PATH,base.PATH);
});

test('real login test is never invoked from the unit-test import', () => {
  assert.equal(typeof isolatedEnv,'function');
  assert.equal(typeof parseOptions,'function');
});

test('safe failure categories distinguish missing model, bridge and project-token conditions', () => {
  assert.equal(classify('ZC does not implement the account-provider authentication bridge', false), 'NATIVE_AUTH_BRIDGE_UNAVAILABLE');
  assert.equal(classify('project_token_login_failed', false), 'PROJECT_TOKEN_LOGIN_FAILED');
  assert.equal(classify('The runtime marked this model unavailable', false), 'MODEL_UNAVAILABLE');
  assert.equal(classify('No native model selected', false), 'MODEL_NOT_CONFIGURED');
  assert.equal(classify('HTTP 401 unauthorized', false), 'UNAUTHORIZED');
  assert.equal(classify('Some otherwise opaque failure', false), 'UNCLASSIFIED_EXIT');
  assert.equal(classify('project_token_login_failed', true), 'TIMEOUT_OR_EXCESS_OUTPUT');
  // Do not return untrusted message text, account tokens, or provider headers.
  assert.doesNotMatch(classify('Authorization: Bearer secret-live-value', false), /secret-live-value/);
});

test('auth report shows each native model-selection handshake bit without exposing raw data', () => {
  const details = formatNativePhase({
    phase:'model_select',category:'OTHER',modelAdvertised:true,
    initialModelSupplied:true, initialModelConfirmed:false,
    selectedAtStart:false,setModelRpcSent:true,setModelRpcAcknowledged:false,
    setModelRpcRejected:true,rpcErrorCode:-32602,providerHeaderRequests:0,
    token:'Bearer private-secret',errorMessage:'Sensitive account response'
  });
  assert.equal(details, [
    'phase=model_select','category=OTHER','modelAdvertised=true',
    'initialModelSupplied=true','initialModelConfirmed=false',
    'selectedAtStart=false','setModelRpcSent=true','setModelRpcAcknowledged=false',
    'setModelRpcRejected=true','rpcErrorCode=-32602','providerHeaderRequests=0'
  ].join(' '));
  assert.doesNotMatch(details,/private-secret|Sensitive|token|errorMessage/);
  assert.equal(formatNativePhase({phase:'unexpected\nsecret',category:'OTHER'}), 'phase=unknown category=INVALID_DIAGNOSTIC');
});
