#!/usr/bin/env node
// Real registry and engine download in an isolated runner home. No model or login.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/util.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const home = await mkdtemp(join(tmpdir(), 'zc managed install '));
const windows = process.platform === 'win32';
const state = join(home, 'state');
await mkdir(state, { recursive: true });
await writeFile(join(state, 'config.json'), JSON.stringify({ theme: 'light', backend: 'native' }));
const credential = join(home, '.zcode', 'v2', 'credentials.json');
await mkdir(join(home, '.zcode', 'v2'), { recursive: true });
const sentinel = '{"test-sentinel":"not-a-real-credential"}\n';
await writeFile(credential, sentinel);
const env = { ...process.env, HOME: home, USERPROFILE: home,
  LOCALAPPDATA: join(home, 'LocalAppData'), XDG_DATA_HOME: join(home, 'data'),
  ZC_HOME: state, SHELL: '/bin/bash', npm_config_cache: join(home, 'npm-cache'),
  ZCODE_DISABLE_UPDATE_CHECK: '1' };
function run(command, args, timeout = 600000) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8', timeout,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true, shell: false });
  if (result.error || result.status !== 0) throw new Error(
    `${command} failed: ${result.error?.message || result.status}\n${result.stdout || ''}\n${result.stderr || ''}`);
  return result.stdout.trim();
}
try {
  const archive = resolve(root, `striking-lions-zc-${VERSION}.tgz`);
  if (windows) run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', join(root, 'install/install.ps1'), '-Package', archive]);
  else run('bash', [join(root, 'install/install.sh'), '--package', archive]);
  const launcher = join(home, '.local', 'bin', windows ? 'zc.cmd' : 'zc');
  env.ZC_TEST_LAUNCHER = launcher;
  const launch = (args) => windows
    ? run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `& $env:ZC_TEST_LAUNCHER ${args.join(' ')}; exit $LASTEXITCODE`], 30000)
    : run(launcher, args, 30000);
  assert.equal(launch(['--version']), VERSION);
  assert.match(launch(['demo', '--plain']), /OFFLINE DEMO/);
  const diagnostic = JSON.parse(launch(['doctor', '--json']));
  assert.equal(diagnostic.checks.find(c => c.name === 'runtime')?.ok, true);
  assert.equal(diagnostic.checks.find(c => c.name === 'authentication')?.ok, null);
  const config = JSON.parse(await readFile(join(state, 'config.json'), 'utf8'));
  assert.equal(config.theme, 'light');
  assert.equal(config.runtime.command, 'managed');
  assert.equal(await readFile(credential, 'utf8'), sentinel);
  console.log('PASS: actual managed engine download, runtime install, launcher, offline demo, local diagnostics, theme retention, and credential-sentinel preservation. No authentication or model request.');
} finally { await rm(home, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 }); }
