#!/usr/bin/env node
// LIVE native-app-server phase probe, used only by auth-lifecycle-check.mjs.
// No raw stderr, headers, credentials, provider replies, or session IDs are printed.
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { NativeBackend } from '../src/backends/native.mjs';
import { validateConfig } from '../src/config.mjs';
import { formatNativeModel } from '../src/backends/native-contract.mjs';

const mark = 'ZC_AUTH_LIFECYCLE_OK';
const stamp = text => createHash('sha256').update(text).digest('hex').slice(0, 10);
export function failureKind(error) {
  const msg = String(error?.message || '');
  if (/not in the runtime catalog|did not confirm that exact model|unavailable/i.test(msg)) return 'MODEL_SELECTION';
  if (/no native model selected|no model selected/i.test(msg)) return 'MODEL_REQUIRED';
  if (/account-provider authentication bridge|requestProviderRuntimeHeaders/i.test(msg)) return 'ACCOUNT_HEADER_BRIDGE';
  if (/project_token_login_failed/i.test(msg)) return 'PROJECT_TOKEN_LOGIN_FAILED';
  if (/project_token_login_required/i.test(msg)) return 'PROJECT_TOKEN_LOGIN_REQUIRED';
  if (/unauthori[sz]ed|\b401\b/i.test(msg)) return 'UNAUTHORIZED';
  if (/\b403\b|not entitled|forbidden/i.test(msg)) return 'ACCESS_FORBIDDEN';
  if (/permission mode|expected.*mode|conflicting permission|not requested/i.test(msg)) return 'MODE';
  if (/protocol|snapshot|rpc|subscribe/i.test(msg)) return 'PROTOCOL';
  if (/timed out|timeout/i.test(msg)) return 'TIMEOUT';
  if (/runtime exited|closed its connection|disconnected/i.test(msg)) return 'RUNTIME_DISCONNECTED';
  return 'OTHER';
}

export async function runProbe({ cwd, model, mode = 'ask', makeBackend, timeoutMs = 60000 }) {
  if (!['ask', 'read-only'].includes(mode)) throw new Error('Invalid native test mode');
  const summary = { phase: 'startup', category: 'UNFINISHED', modelAdvertised: false, selected: false,
    initialModelSupplied: true, initialModelConfirmed: false,
    selectedAtStart: false, setModelRpcSent: false, setModelRpcAcknowledged: false, setModelRpcRejected: false,
    rpcErrorCode: null, providerHeaderRequests: 0, toolRequests: 0, responseVerified: false };
  const answerParts = [];
  let backend;
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    backend = makeBackend({
      cwd, config: validateConfig({ mode }),
      emit: event => {
        if (event?.type === 'message' && event.role === 'assistant' && typeof event.text === 'string') answerParts.push(event.text);
        if (event?.type === 'delta' && typeof event.text === 'string') answerParts.push(event.text);
        if (event?.type === 'tool') summary.toolRequests++;
      },
      ask: async () => false,
    });
    // Instrument only method names, never protocol payloads.
    const original = backend.interaction.bind(backend);
    backend.interaction = async (method, params) => {
      if (method === 'interaction/requestProviderRuntimeHeaders') summary.providerHeaderRequests++;
      return original(method, params);
    };
    summary.phase = 'session_start';
    // The inspected v1 protocol supports model in session/create. In contrast,
    // the failing real run attempted a later session/setModel mutation.
    await backend.start(undefined, { initialModel: model });
    summary.initialModelConfirmed = Boolean(backend.model &&
      formatNativeModel(backend.model).split('
    summary.selectedAtStart = backend.model !== undefined && formatNativeModel(backend.model) === model;
    // Observe RPC success/failure without reading or logging payloads, response
    // bodies, provider configuration, or encrypted credential stores.
    if (backend.rpc && typeof backend.rpc.request === 'function') {
      const originalRequest = backend.rpc.request.bind(backend.rpc);
      backend.rpc.request = async (method, params, options) => {
        if (method === 'session/setModel') summary.setModelRpcSent = true;
        try {
          const result = await originalRequest(method, params, options);
          if (method === 'session/setModel') summary.setModelRpcAcknowledged = true;
          return result;
        } catch (error) {
          if (method === 'session/setModel') summary.setModelRpcRejected = true;
          throw error;
        }
      };
    }
    summary.phase = 'model_catalog';
    const catalog = await backend.models();
    summary.modelAdvertised = catalog.some(option => option.value === model && !option.disabled);
    summary.phase = 'model_select';
    await backend.setModel(model, { allowUnlistedExact: true });
    summary.selected = formatNativeModel(backend.model) === model;
    summary.phase = 'request';
    // No explicit shell or file tooling is requested. Any permission prompt is denied.
    await backend.send('Respond with exactly ' + mark + ' and nothing else. Do not use tools.', timeout);
    summary.phase = 'response';
    summary.responseVerified = answerParts.some(text => text.includes(mark));
    if (!summary.responseVerified) throw new Error('Native response verification failed');
    summary.category = 'SUCCESS';
    return summary;
  } catch (error) {
    summary.category = failureKind(error);
    summary.rpcErrorCode = Number.isSafeInteger(error?.code) &&
      error.code >= -32768 && error.code <= 32767 ? error.code : null;
    // A short nonsecret phase and reason code suffice for triage. Never print errors.
    return summary;
  } finally {
    if (backend) await backend.dispose().catch(() => {});
  }
}

async function main() {
  const [model, workspace, mode = 'ask'] = process.argv.slice(2);
  if (!model || !workspace) throw new Error('Missing native phase probe options');
  if (!/^[A-Za-z0-9:_-]+\/[A-Za-z0-9._-]+$/.test(model)) throw new Error('Invalid model ID');
  const cwd = await realpath(workspace);
  const summary = await runProbe({ cwd, model, mode, makeBackend: options => new NativeBackend(options) });
  // This one JSON record is the *only* intended diagnostic output.
  console.log(JSON.stringify(summary));
  if (!summary.responseVerified) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.log(JSON.stringify({phase:'setup',category:'OTHER',responseVerified:false}));process.exitCode = 1; });
}
)[0] === model);
    if (timeout.aborted) throw new Error('Native test timeout');
    summary.selectedAtStart = backend.model !== undefined && formatNativeModel(backend.model) === model;
    // Observe RPC success/failure without reading or logging payloads, response
    // bodies, provider configuration, or encrypted credential stores.
    if (backend.rpc && typeof backend.rpc.request === 'function') {
      const originalRequest = backend.rpc.request.bind(backend.rpc);
      backend.rpc.request = async (method, params, options) => {
        if (method === 'session/setModel') summary.setModelRpcSent = true;
        try {
          const result = await originalRequest(method, params, options);
          if (method === 'session/setModel') summary.setModelRpcAcknowledged = true;
          return result;
        } catch (error) {
          if (method === 'session/setModel') summary.setModelRpcRejected = true;
          throw error;
        }
      };
    }
    summary.phase = 'model_catalog';
    const catalog = await backend.models();
    summary.modelAdvertised = catalog.some(option => option.value === model && !option.disabled);
    summary.phase = 'model_select';
    await backend.setModel(model, { allowUnlistedExact: true });
    summary.selected = formatNativeModel(backend.model) === model;
    summary.phase = 'request';
    // No explicit shell or file tooling is requested. Any permission prompt is denied.
    await backend.send('Respond with exactly ' + mark + ' and nothing else. Do not use tools.', timeout);
    summary.phase = 'response';
    summary.responseVerified = answerParts.some(text => text.includes(mark));
    if (!summary.responseVerified) throw new Error('Native response verification failed');
    summary.category = 'SUCCESS';
    return summary;
  } catch (error) {
    summary.category = failureKind(error);
    // A short nonsecret phase and reason code suffice for triage. Never print errors.
    return summary;
  } finally {
    if (backend) await backend.dispose().catch(() => {});
  }
}

async function main() {
  const [model, workspace, mode = 'ask'] = process.argv.slice(2);
  if (!model || !workspace) throw new Error('Missing native phase probe options');
  if (!/^[A-Za-z0-9:_-]+\/[A-Za-z0-9._-]+$/.test(model)) throw new Error('Invalid model ID');
  const cwd = await realpath(workspace);
  const summary = await runProbe({ cwd, model, mode, makeBackend: options => new NativeBackend(options) });
  // This one JSON record is the *only* intended diagnostic output.
  console.log(JSON.stringify(summary));
  if (!summary.responseVerified) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.log(JSON.stringify({phase:'setup',category:'OTHER',responseVerified:false}));process.exitCode = 1; });
}
