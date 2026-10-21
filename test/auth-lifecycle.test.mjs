import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tmpdir } from 'node:os';
import { mkdtemp, lstat, rm, symlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { resolve } from 'node:path';
import { isolatedEnv, parseOptions, modelDefault, classify, formatNativePhase, prepareReusableProfile } from '../scripts/auth-lifecycle-check.mjs';

test('live authentication test requires a well-formed explicit provider/model and bounded wait', () => {
  assert.equal(parseOptions([]).model, modelDefault);
  assert.equal(parseOptions(['--delay-seconds','60']).delaySeconds, 60);
  assert.equal(parseOptions(['--keep-on-failure']).keepOnFailure, true);
  assert.equal(parseOptions([]).keepOnFailure, false);
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

test('opt-in reusable OAuth test directory is private, reusable and outside git checkout', async t => {
  if (process.platform === 'win32') return;
  const home = await mkdtemp(join(tmpdir(), 'zc-auth-dir-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const profile = await prepareReusableProfile(home);
  const mode = (await lstat(profile)).mode & 0o777;
  assert.equal(mode, 0o700);
  assert.equal(profile, join(home, '.local', 'state', 'zc-auth-lifecycle-profile'));
  assert.equal(await prepareReusableProfile(home), profile);
});
test('reusable auth profile rejects a symlink in place of the profile directory', async t => {
  if (process.platform === 'win32') return;
  const home = await mkdtemp(join(tmpdir(), 'zc-auth-symlink-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  const state = join(home, '.local', 'state');
  await mkdir(state, { recursive: true });
  const other = join(home, 'other');
  await mkdir(other, { mode: 0o700 });
  await symlink(other, join(state, 'zc-auth-lifecycle-profile'));
  await assert.rejects(prepareReusableProfile(home), /must be a user-owned 0700 directory/);
});
