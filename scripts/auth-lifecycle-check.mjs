#!/usr/bin/env node
/**
 * Opt-in LIVE account lifecycle test using an isolated local ZCode profile.
 * The script never asks the user to disclose OAuth links, callback codes, or tokens.
 * This checks login, repeat requests, local logout, denial, and re-login.
 * It does NOT prove automatic refresh of an expired OAuth or project token.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, chmod, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zc = join(root, 'bin', 'zc.mjs');
const zcode = join(root, 'node_modules', 'zcode-app-cli', 'bin', 'zcode.js');
const marker = 'ZC_AUTH_LIFECYCLE_OK';
export const modelDefault = 'account:zai-individual-coding-plan/GLM-5.3';

export function parseOptions(argv) {
  let model = modelDefault, delaySeconds = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model' && argv[i + 1]) model = argv[++i];
    else if (argv[i] === '--delay-seconds' && argv[i + 1]) delaySeconds = Number(argv[++i]);
    else throw new Error('Usage: node scripts/auth-lifecycle-check.mjs [--model provider/model] [--delay-seconds 0..3600]');
  }
  if (!/^[A-Za-z0-9:_-]+\/[A-Za-z0-9._-]+$/.test(model) || model.length > 160) throw new Error('Invalid model ID');
  if (!Number.isInteger(delaySeconds) || delaySeconds < 0 || delaySeconds > 3600) throw new Error('Delay must be 0..3600 seconds');
  return { model, delaySeconds };
}

export function isolatedEnv(profile, base = process.env) {
  const env = { ...base, HOME: profile, USERPROFILE: profile,
    XDG_CONFIG_HOME: join(profile, 'config'), XDG_CACHE_HOME: join(profile, 'cache'),
    XDG_DATA_HOME: join(profile, 'data'), ZC_HOME: join(profile, 'zc'),
    ZCODE_DATA_BASE_DIR: join(profile, 'runtime'),
    ZCODE_CLI_SETTINGS_FILE: join(profile, 'setting.json'),
    ZCODE_CLI_CREDENTIALS_FILE: join(profile, 'credentials.json'),
    ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(profile, 'provider_config.json'),
    ZCODE_SESSION_DB_PATH: join(profile, 'sessions.sqlite'),
    ZCODE_APP_SERVER_AUTH_MODE: 'standalone',
    ZCODE_DISABLE_UPDATE_CHECK: '1', ZCODE_NODE: process.execPath };
  for (const key of Object.keys(env)) {
    if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET|PROJECT_TOKEN|^AWS_|^GH_TOKEN$|^GITHUB_TOKEN$|^NPM_TOKEN$|^OPENAI_|^ANTHROPIC_|^SSH_AUTH_SOCK$)/i.test(key)) delete env[key];
  }
  return env;
}

export function classify(text, timedOut) {
  if (timedOut) return 'TIMEOUT_OR_EXCESS_OUTPUT';
  const input = String(text).slice(-160000);
  if (/account-provider authentication bridge|NATIVE_ACCOUNT_AUTH_UNAVAILABLE/i.test(input)) return 'NATIVE_AUTH_BRIDGE_UNAVAILABLE';
  if (/project_token_login_failed/i.test(input)) return 'PROJECT_TOKEN_LOGIN_FAILED';
  if (/project_token_login_required/i.test(input)) return 'PROJECT_TOKEN_LOGIN_REQUIRED';
  if (/no native model selected|no model selected|model access is not configured/i.test(input)) return 'MODEL_NOT_CONFIGURED';
  if (/not in the runtime catalog|runtime marked this model unavailable/i.test(input)) return 'MODEL_UNAVAILABLE';
  if (/permission mode|mode change|reported plan|reported guarded/i.test(input)) return 'MODE_UNCONFIRMED';
  if (/unsupported protocol|runtime snapshot|app-server/i.test(input)) return 'NATIVE_PROTOCOL_OR_RUNTIME_FAILURE';
  if (/403|forbidden|not entitled/i.test(input)) return 'ACCESS_FORBIDDEN';
  if (/unauthori[sz]ed|401/i.test(input)) return 'UNAUTHORIZED';
  if (/timed out|timeout/i.test(input)) return 'RUNTIME_TIMEOUT';
  if (/ZCode runtime exited|Runtime disconnected/i.test(input)) return 'RUNTIME_DISCONNECTED';
  return 'UNCLASSIFIED_EXIT';
}

function execute(script, args, env, cwd, interactive = false, timeoutMs = 180000) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd, env, windowsHide: true, stdio: interactive ? 'inherit' : ['ignore', 'pipe', 'pipe']
    });
    let output = '', size = 0, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    for (const s of interactive ? [] : [child.stdout, child.stderr]) s.on('data', bytes => {
      size += bytes.length;
      if (size > 512000) { timedOut = true; child.kill('SIGTERM'); }
      else output += bytes.toString('utf8');
    });
    child.once('error', err => { clearTimeout(timer); reject(new Error('Unable to spawn CLI: ' + err.code)); });
    child.once('close', code => { clearTimeout(timer); resolveRun({ code: code ?? 1, output, timedOut }); });
  });
}

async function main() {
  const { model, delaySeconds } = parseOptions(process.argv.slice(2));
  if (!process.stdin.isTTY) throw new Error('Run from your interactive terminal. Do not run this live OAuth test in CI.');
  for (const path of [zc, zcode]) await access(path).catch(() => { throw new Error('First run: npm ci --ignore-scripts --no-audit --no-fund'); });
  const profile = await mkdtemp(join(tmpdir(), 'zc-auth-lifecycle-'));
  await chmod(profile, 0o700);
  const workspace = join(profile, 'workspace');
  await mkdir(workspace, { mode: 0o700 });
  const env = isolatedEnv(profile);
  const results = [];
  const record = (step, pass, detail) => {
    results.push({ step, pass, detail });
    console.log((pass ? 'PASS ' : 'FAIL ') + step + ': ' + detail);
    return pass;
  };
  const probe = (backend = 'native') => execute(zc, ['exec',
    'Respond with exactly ' + marker + ' and nothing else. Do not use tools.',
    '--cwd', workspace, '--backend', backend,
    '--mode', backend === 'native-stream' ? 'guarded' : 'read-only',
    '--model', model, '--trust'], env, workspace);
  const login = async label => {
    console.log('\nThe official Z.ai OAuth URL will be printed by your local runtime.');
    console.log('Open it privately, then return to this terminal. Never paste the link into chat.');
    const result = await execute(zc, ['login', '--oauth', '--no-browser'], env, workspace, true, 300000);
    return record(label, result.code === 0 && !result.timedOut, result.code === 0 && !result.timedOut ? 'completed' : 'did not complete');
  };
  const logout = async label => {
    // The pinned public CLI does not document a logout subcommand. Remove only
    // this throwaway profile's explicitly redirected local credentials.
    // Never claim that this revokes an upstream browser or server session.
    await rm(env.ZCODE_CLI_CREDENTIALS_FILE, { force: true });
    return record(label, true, 'temporary local credentials cleared; remote revocation not asserted');
  };
  const request = async (label, backend = 'native') => {
    const result = await probe(backend);
    const pass = result.code === 0 && !result.timedOut && result.output.includes(marker);
    return record(label, pass, pass ? 'account-backed reply received' : classify(result.output, result.timedOut) + ' (exit ' + result.code + ')');
  };
  try {
    console.log('LIVE ZC auth lifecycle test. This temporary profile has its own credentials, config, sessions, and HOME.');
    console.log('The test consumes model quota. It never submits your source files or runs shell tools.');
    if (!await login('login 1')) return;
    if (!await request('account access control through guarded native-stream', 'native-stream')) return;
    if (!await request('initial authenticated request through default native')) return;
    if (delaySeconds) {
      console.log('Waiting ' + delaySeconds + ' seconds. Token expiry is not established by elapsed time alone.');
      await new Promise(done => setTimeout(done, delaySeconds * 1000));
    }
    if (!await request('subsequent authenticated request')) return;
    if (!await logout('logout 1')) return;
    const denied = await probe();
    const deniedReason = classify(denied.output, denied.timedOut);
    const expectedDenial = ['UNAUTHORIZED', 'PROJECT_TOKEN_LOGIN_REQUIRED', 'MODEL_NOT_CONFIGURED', 'MODEL_UNAVAILABLE'].includes(deniedReason);
    if (!record('request denied after temporary credential removal',
      denied.code !== 0 && !denied.timedOut && expectedDenial,
      denied.code === 0 ? 'UNEXPECTED_ACCESS' : deniedReason + ' (exit ' + denied.code + ')')) return;
    if (!await login('login 2')) return;
    if (!await request('authenticated request after re-login')) return;
    await logout('final isolated logout');
  } finally {
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    console.log('Temporary test profile disposed. Existing saved ZCode login was not intentionally logged out.');
    console.log('SHARE ONLY THIS RESULT: ' + JSON.stringify(results));
    if (results.length !== 9 || results.some(row => !row.pass)) process.exitCode = 1;
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('Auth test failed to start: ' + error.message); process.exitCode = 1; });
}
