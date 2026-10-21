#!/usr/bin/env node
/**
 * Opt-in LIVE production-gate smoke. Designed to execute INSIDE the supplied
 * disposable Docker container, never directly against a user's normal home.
 * No host paths or credentials are mounted, and raw model output is not logged.
 * This is NOT a test of token expiration or a security certification.
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, resolve, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeBackend } from '../src/backends/native.mjs';
import { validateConfig } from '../src/config.mjs';
import { spawnProcess } from '../src/process.mjs';
import { isolatedEnv } from './auth-lifecycle-check.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zc = join(root, 'bin', 'zc.mjs');
const marker = () => randomBytes(10).toString('hex');
const wait = ms => new Promise(resolveWait => setTimeout(resolveWait, ms));

export function parseLiveOptions(argv) {
  let model = 'account:zai-individual-coding-plan/GLM-5.3', continuityMinutes = 0;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--model' && argv[i + 1]) model = argv[++i];
    else if (argv[i] === '--continuity-minutes' && argv[i + 1]) continuityMinutes = Number(argv[++i]);
    else throw new Error('Usage: live-production-check.mjs [--model provider/model] [--continuity-minutes 0..120]');
  }
  if (!/^[A-Za-z0-9:_-]+\/[A-Za-z0-9._-]+$/.test(model)) throw new Error('Invalid exact model reference');
  if (!Number.isInteger(continuityMinutes) || continuityMinutes < 0 || continuityMinutes > 120) {
    throw new Error('continuity-minutes must be an integer from 0 to 120');
  }
  return { model, continuityMinutes };
}

export function safePermissionTarget(request, workspace, allowPaths = []) {
  if (!/^(?:Allow )?(Read|Edit|Write)\??$/i.test(String(request?.title || ''))) return false;
  let input;
  try { input = JSON.parse(request.input); } catch { return false; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const entries = ['file_path','filePath','path','targetPath'].filter(k => typeof input[k] === 'string');
  if (entries.length !== 1) return false;
  const path = input[entries[0]];
  if (path.includes('\0') || path.includes('\n') || path.includes('\\')) return false;
  const full = resolve(workspace, path);
  const rel = relative(workspace, full);
  if (rel.startsWith('..') || isAbsolute(rel)) return false;
  return allowPaths.includes(full);
}

export function resultCategory(error) {
  const message = String(error?.message || '');
  if (error?.name === 'AbortError') return 'ABORTED';
  if (/session not found/i.test(message)) return 'SESSION_NOT_PERSISTED';
  if (/auth|token|401|login/i.test(message)) return 'ACCOUNT_ACCESS';
  if (/permission|denied|read-only/i.test(message)) return 'PERMISSION';
  if (/model|reasoning|catalog/i.test(message)) return 'MODEL_SELECTION';
  if (/timeout|timed out|unconfirmed/i.test(message)) return 'UNCONFIRMED_OR_TIMEOUT';
  return 'OTHER_FAILURE';
}

function officialLogin(env, cwd) {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [zc, 'login', '--oauth', '--no-browser'],
      { cwd, env, stdio: 'inherit', windowsHide: true });
    const timeout = setTimeout(() => child.kill('SIGTERM'), 300000);
    child.once('error', error => { clearTimeout(timeout); fail(error); });
    child.once('close', code => { clearTimeout(timeout); done(code === 0); });
  });
}

async function main() {
  const { model, continuityMinutes } = parseLiveOptions(process.argv.slice(2));
  // Refuse to run live agent editing with mere workspace trust: the native
  // guarded runtime is NOT an OS sandbox.
  if (process.env.ZC_LIVE_CONTAINER !== '1' ||
      !await lstat('/.dockerenv').then(s => s.isFile(), () => false) ||
      typeof process.getuid !== 'function' || process.getuid() === 0 ||
      !process.stdin.isTTY) {
    throw new Error('Live editing requires the supplied non-root interactive Docker runner. Do not run this directly on your VPS.');
  }
  await access(zc);
  const profile = await mkdtemp(join(tmpdir(), 'zc-live-'));
  const workspace = join(profile, 'workspace');
  await mkdir(workspace, { mode: 0o700 });
  const env = isolatedEnv(profile);
  const results = [];
  const record = (name, status, reason) => {
    // Fixed text only; no raw upstream diagnostics or user data.
    results.push({ step: name, status, reason });
    console.log(status + ' ' + name + ': ' + reason);
  };
  const nonce = marker();
  const readMarker = 'READ_' + nonce;
  const editMarker = 'EDIT_' + nonce;
  const memoryMarker = 'SESSION_' + nonce;
  const readPath = join(workspace, 'canary.txt');
  const editPath = join(workspace, 'draft.txt');
  const protectedPath = join(workspace, 'unchanged.txt');
  let app, resumeApp, phase = 'start', questionCount = 0, allowCount = 0;
  const events = [];
  const eventsAfter = index => events.slice(index);
  const onAsk = async request => {
    questionCount++;
    const allow = phase === 'edit' && safePermissionTarget(request, workspace, [editPath]) ||
      phase === 'read' && safePermissionTarget(request, workspace, [readPath]);
    if (allow) allowCount++;
    return allow;
  };
  const createBackend = () => new NativeBackend({
    cwd: workspace, config: validateConfig({ backend: 'native', mode: 'ask',
      runtime: { command: 'managed', args: [] }, requestTimeoutMs: 60000 }),
    ask: onAsk,
    emit: event => events.push(event),
    spawnImpl: (command, args, options) => spawnProcess(command, args, {
      ...options, env: { ...env, ZCODE_NODE: options.env?.ZCODE_NODE || process.execPath,
        ZCODE_APP_SERVER_AUTH_MODE: 'standalone' },
    }),
  });
  const send = async (backend, prompt) => {
    const from = events.length;
    const signal = AbortSignal.timeout(120000);
    await backend.send(prompt, signal);
    return eventsAfter(from).filter(event =>
      event.type === 'message' && event.role === 'assistant' && typeof event.text === 'string'
    ).map(event => event.text).join('\n') + eventsAfter(from).filter(event =>
      event.type === 'delta' && typeof event.text === 'string'
    ).map(event => event.text).join('');
  };
  try {
    await writeFile(readPath, readMarker + '\n', { mode: 0o600 });
    await writeFile(editPath, 'ORIGINAL\n', { mode: 0o600 });
    await writeFile(protectedPath, 'DO_NOT_TOUCH\n', { mode: 0o600 });

    console.log('This test runs only inside a disposable non-root Docker container.');
    console.log('The login URL is private. Never paste it, a callback or a token into chat.');
    phase = 'login';
    if (!await officialLogin(env, workspace)) { record('oauth_login', 'FAIL', 'LOGIN_NOT_COMPLETED'); return; }
    record('oauth_login', 'PASS', 'COMPLETED');

    phase = 'start';
    app = createBackend();
    await app.start();
    await app.setModel(model, { allowUnlistedExact: true });
    if (app.runtimeMode !== 'guarded') throw new Error('Guarded mode was not confirmed');
    record('guarded_session', 'PASS', 'MODE_CONFIRMED');

    phase = 'read';
    const readAnswer = await send(app,
      'Read the exact contents of canary.txt using the file-reading tool. Reply with the file content only. ' +
      'Do not alter files. Remember this conversation tag for our later follow-up: ' + memoryMarker);
    const readPass = readAnswer.includes(readMarker) &&
      await readFile(readPath, 'utf8') === readMarker + '\n';
    record('live_file_read', readPass ? 'PASS' : 'FAIL',
      readPass ? 'UNIQUE_CANARY_OBSERVED_UNCHANGED' : 'CANARY_NOT_CONFIRMED');

    phase = 'edit';
    const editAnswer = await send(app,
      'Edit draft.txt in this workspace so its complete contents become exactly ' + editMarker +
      ' followed by one newline. Use a file editing tool rather than a shell command. ' +
      'Never modify canary.txt or unchanged.txt. Afterward reply EDIT_DONE.');
    void editAnswer;
    const currentEdit = await readFile(editPath, 'utf8');
    const untouched = await readFile(protectedPath, 'utf8');
    const editPass = currentEdit === editMarker + '\n' && untouched === 'DO_NOT_TOUCH\n' &&
      await readFile(readPath, 'utf8') === readMarker + '\n';
    record('live_file_edit', editPass ? 'PASS' : 'FAIL',
      editPass ? 'EXACT_EDIT_AND_SENTINELS_VERIFIED' : 'EDIT_OR_SENTINELS_NOT_VERIFIED');

    phase = 'deny';
    const beforeAsk = questionCount;
    const denied = await app.setMode('yolo');
    const denyPass = denied?.declined === true && app.runtimeMode === 'guarded' &&
      questionCount === beforeAsk + 1;
    record('full_access_denial', denyPass ? 'PASS' : 'FAIL',
      denyPass ? 'CONSENT_DENIED_GUARDED_RETAINED' : 'DENIAL_UNCONFIRMED');

    phase = 'resume';
    const sessionId = app.session.sessionId;
    await app.dispose(); app = null;
    resumeApp = createBackend();
    const from = events.length;
    const resumed = await resumeApp.start(sessionId);
    const historical = eventsAfter(from);
    const historyPresent = historical.some(event => event.role === 'user' &&
      typeof event.text === 'string' && event.text.includes(memoryMarker));
    const previousModeRestored = resumeApp.runtimeMode === 'guarded';
    let followup = '';
    if (resumed.id === sessionId && historyPresent && previousModeRestored) {
      followup = await send(resumeApp,
        'Without reading any file or using tools, repeat the conversation tag from my first message. ' +
        'Return just the tag.');
    }
    const resumePass = resumed.id === sessionId && historyPresent && previousModeRestored &&
      followup.includes(memoryMarker);
    record('cold_session_resume', resumePass ? 'PASS' : 'FAIL',
      resumePass ? 'HISTORY_AND_CONTEXT_CONFIRMED' : 'HISTORY_OR_CONTEXT_UNCONFIRMED');

    if (continuityMinutes) {
      phase = 'continuity';
      console.log('Waiting ' + continuityMinutes + ' minutes before a second model response. This DOES NOT establish token expiry.');
      await wait(continuityMinutes * 60000);
      const answer = await send(resumeApp, 'Reply with exactly CONTINUITY_OK and no tools.');
      record('account_continuity_after_delay', answer.includes('CONTINUITY_OK') ? 'PASS' : 'FAIL',
        answer.includes('CONTINUITY_OK') ? 'MODEL_CONTINUITY_ONLY_NOT_TOKEN_REFRESH' : 'CONTINUITY_NOT_CONFIRMED');
    }

    phase = 'cancel';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    let cancelled = false, completed = false;
    try {
      await resumeApp.send('In this disposable container only, run the harmless shell command sleep 30. ' +
        'Do not modify any files and only reply when the wait is finished.', controller.signal);
      completed = true;
    } catch (error) {
      cancelled = error?.name === 'AbortError';
    } finally { clearTimeout(timer); }
    const after = await resumeApp.inspect().catch(() => null);
    if (cancelled && after?.frontendTurn === false && after?.mainActive === false) {
      record('live_cancellation', 'PASS', 'ABORT_AND_IDLE_CONFIRMED');
    } else if (completed) {
      record('live_cancellation', 'INCONCLUSIVE', 'TURN_COMPLETED_BEFORE_STOP');
    } else {
      record('live_cancellation', 'INCONCLUSIVE', 'RUNTIME_STOP_NOT_CONFIRMED');
    }

    record('permission_prompts', 'INFO', questionCount > 0 ?
      'PROMPTS_OBSERVED_APPROVED_' + allowCount : 'NO_RUNTIME_TOOL_PROMPTS_OBSERVED');
  } catch (error) {
    record('stage_' + phase, 'FAIL', resultCategory(error));
  } finally {
    try { await resumeApp?.dispose(); } catch {}
    try { await app?.dispose(); } catch {}
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    const mandatory = results.filter(x => x.status === 'FAIL');
    process.exitCode = mandatory.length ? 1 : 0;
    console.log('LIVE_PRODUCTION_RESULT: ' + JSON.stringify(results));
    console.log('This validates only the results marked PASS. No automatic expiry-based token renewal is asserted.');
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { console.error('Live check startup failed: ' + resultCategory(error)); process.exitCode = 1; });
}
