#!/usr/bin/env node
// Exercise the real app-server through the frontend adapter, without inference.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULTS } from '../src/config.mjs';
import { NativeBackend } from '../src/backends/native.mjs';
import { spawnProcess } from '../src/process.mjs';
const home = await mkdtemp(join(tmpdir(), 'zc-native-session-'));
const workspace = join(home, 'workspace');
await mkdir(workspace);
const settings = join(home, 'settings.json');
await writeFile(settings, JSON.stringify({ features: { mcp: false }, plugins: { enabled: false }, hooks: { enabled: false } }));
const env = { ...process.env, HOME: home, USERPROFILE: home, ZC_HOME: join(home, 'zc'),
  ZCODE_DATA_BASE_DIR: join(home, 'runtime'), ZCODE_CLI_SETTINGS_FILE: settings,
  ZCODE_CLI_CREDENTIALS_FILE: join(home, 'credentials.json'),
  ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(home, 'providers.json'),
  ZCODE_SESSION_DB_PATH: join(home, 'sessions.sqlite'), ZCODE_DISABLE_UPDATE_CHECK: '1',
  ZCODE_APP_SERVER_AUTH_MODE: 'standalone' };
for (const name of Object.keys(env)) if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET)/i.test(name)) delete env[name];
let submitted = 0, toolEvents = 0;
const make = () => new NativeBackend({ cwd: workspace, config: { ...DEFAULTS, runtime: { command: 'managed', args: [] } },
  emit: event => { if (event.type === 'tool') toolEvents++; },
  ask: async request => request.allowLabel === 'Enable YOLO' && request.risk === 'full access',
  spawnImpl: (command, args, options) => spawnProcess(command, args, { ...options, env }) });
let backend = make();
const timer = setTimeout(() => { console.error('Real runtime session smoke timed out. No model prompt was submitted.'); void backend.dispose().finally(() => process.exit(1)); }, 90000);
let stage = 'create and subscribe';
try {
  const session = await backend.start();
  console.log('PASS: real runtime created and subscribed to an unbound session.');
  assert.ok(session.id); assert.equal(backend.runtimeMode, 'guarded');
  const request = backend.rpc.request.bind(backend.rpc);
  backend.rpc.request = (method, params, options) => {
    if (['session/send', 'session/compact', 'workspace/generateText'].includes(method)) {
      submitted++; throw new Error('Smoke must not submit a model request.');
    }
    return request(method, params, options);
  };
  stage = 'list';
  const listed = await backend.sessions();
  assert.ok(listed.some(s => s.id === session.id));
  stage = 'permission transition';
  await backend.setMode('yolo');
  assert.equal(backend.runtimeMode, 'yolo');
  await backend.setMode('ask');
  assert.equal(backend.runtimeMode, 'guarded');
  console.log('PASS: runtime listed the session and acknowledged explicit YOLO and guarded transitions.');
  stage = 'shutdown';
  await backend.dispose();
  backend = make();
  stage = 'empty-session restart';
  try {
    const restored = await backend.start(session.id);
    assert.equal(restored.id, session.id); assert.equal(backend.runtimeMode, 'guarded');
    console.log('PASS: this runtime retained and restored the empty session.');
  } catch (error) {
    // No conversation was submitted. Some runtime builds omit an empty draft
    // from durable storage. Only that exact case is accepted; other failures fail CI.
    if (error.message !== `Session not found: ${session.id}`) throw error;
    await backend.dispose();
    backend = make();
    const fresh = await backend.start();
    assert.ok(fresh.id); assert.notEqual(fresh.id, session.id);
    assert.equal(backend.runtimeMode, 'guarded');
    console.log('OBSERVED: the runtime did not persist an empty draft; a fresh connection works. Populated-conversation cold resume is not established by this no-inference check.');
  }
  assert.equal(submitted, 0); assert.equal(toolEvents, 0);
  console.log('PASS: actual app-server startup, permissions, shutdown, and restart through ZC. No login, inference prompt, or tool call.');
} catch (error) { throw new Error(`Real runtime check failed during ${stage}: ${error.message}`, { cause: error }); }
finally { clearTimeout(timer); await backend.dispose(); await rm(home, { recursive: true, force: true, maxRetries: 3 }); }
