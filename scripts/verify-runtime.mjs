#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRuntime, runtimeEnvironment, supportsRuntimeNode, RUNTIME_VERSION } from '../src/runtime.mjs';
import { runProcess } from '../src/process.mjs';
import { streamVersionIdentity } from '../src/backends/stream-contract.mjs';
if (!supportsRuntimeNode()) throw new Error('Runtime verification requires Node.js 24.14 or newer.');
const runtime = resolveRuntime({ command: 'managed', args: [] });
const home = await mkdtemp(join(tmpdir(), 'zc-runtime-check-'));
try {
  const env = runtimeEnvironment(runtime, { ...process.env, ZCODE_DATA_BASE_DIR: home,
    ZCODE_CLI_CREDENTIALS_FILE: join(home, 'credentials.json'),
    ZCODE_PERSONAL_PROVIDER_CONFIG_FILE: join(home, 'provider_config.json'),
    ZCODE_CLI_SETTINGS_FILE: join(home, 'setting.json'), ZCODE_DISABLE_UPDATE_CHECK: '1' });
  const result = await runProcess(runtime.command, [...runtime.args, '--version'],
    { cwd: home, env, timeout: 30000, maxBytes: 4000 });
  const identity = streamVersionIdentity(result.output);
  if (result.code !== 0 || result.timedOut || result.truncated || identity?.client !== RUNTIME_VERSION)
    throw new Error('The installed runtime did not report the required client/runtime pair. No model request was made.');
  console.log(`Verified public runtime entry: zcode-app-cli ${identity.client}, zcode-runtime ${identity.runtime}. No login or model request.`);
} finally { await rm(home, { recursive: true, force: true }); }
