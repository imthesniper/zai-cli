// Deterministic fake app-server and token issuer. This does NOT exercise Z.ai
// or the private upstream credential resolver. It checks the ZC frontend's
// behavior when its upstream runtime transparently renews or rejects a token.
import { createInterface } from 'node:readline';

const sessionId = 'fixture-renewal-session';
const providerId = 'fixture-account', modelId = 'GLM-5.3';
const MODEL = { providerId, modelId, options: { reasoningLevel: 'high' } };
let mode = 'guarded', chosen, seq = 0, turn = 0;
let time = 0, token = 'private-fixture-token-1', expiresAt = 10;
let issueCount = 1, refreshAttempts = 0, successfulRefreshes = 0;
let rejectNextRefresh = false, submissions = 0, completions = 0, failures = 0;
const messages = [], promptCounts = new Map();
const write = packet => process.stdout.write(JSON.stringify(packet) + '\n');
const answer = (id, result) => write({ id, result });
const error = (id, code, message) => write({ id, error: { code, message } });
const snapshot = () => ({
  protocol: { name: 'ZCode Protocol', version: 1 },
  session: { sessionId, mode, ...(chosen ? { model: chosen } : {}) },
  messages,
  settings: { model: { available: [
    { ref: { providerId, modelId }, label: 'Fixture account model',
      reasoning: { defaultLevel: 'high', levels: [{ value: 'high', label: 'High' }] } },
  ], ...(chosen ? { current: chosen } : {}) }, mode: { current: mode } },
  runtime: { mainActive: false }, projection: { status: 'idle', pendingPermissions: [] },
});
const sendEvent = (type, turnId, payload) => write({
  method: 'session/event',
  params: { sessionId, turnId, seq: ++seq, type, timestamp: Date.now(), payload },
});
const refresh = () => {
  if (time < expiresAt) return true;
  refreshAttempts++;
  if (rejectNextRefresh) { rejectNextRefresh = false; return false; }
  issueCount++; successfulRefreshes++;
  token = 'private-fixture-token-' + issueCount;
  expiresAt = time + 10;
  return true;
};
const cli = createInterface({ input: process.stdin });
cli.on('line', line => {
  const request = JSON.parse(line), p = request.params || {};
  switch (request.method) {
    case 'session/create': answer(request.id, snapshot()); break;
    case 'session/resume': answer(request.id, snapshot()); break;
    case 'session/setMode': mode = p.mode; answer(request.id, snapshot()); break;
    case 'session/subscribe': answer(request.id, { sessionId, eventSeq: seq, events: [], snapshot: snapshot() }); break;
    case 'session/read': answer(request.id, snapshot()); break;
    case 'session/setModel':
      if (p.model?.providerId !== providerId || p.model.modelId !== modelId ||
          p.model.options?.reasoningLevel !== 'high') {
        error(request.id, -32602, 'Expected exact fixture account model and effort');
        break;
      }
      chosen = MODEL; answer(request.id, snapshot()); break;
    case 'session/send': {
      const turnId = 'fixture-renewal-turn-' + ++turn;
      const inputId = p.inputId;
      submissions++;
      promptCounts.set(inputId, (promptCounts.get(inputId) || 0) + 1);
      answer(request.id, { sessionId, accepted: true, turnId });
      sendEvent('turn.started', turnId, { inputId, input: p.content });
      if (!refresh()) {
        failures++;
        sendEvent('turn.failed', turnId, { inputId, error: { message: 'Simulated token refresh rejected' } });
        break;
      }
      const response = 'FIXTURE_REFRESH_OK_' + submissions;
      completions++;
      messages.push({ info: { role: 'user', messageId: 'user-' + turn }, parts: [{ type: 'text', text: p.content }] });
      messages.push({ info: { role: 'assistant', messageId: 'answer-' + turn }, parts: [{ type: 'text', text: response }] });
      sendEvent('model.streaming', turnId, { kind: 'text_delta', assistantMessageId: 'answer-' + turn, delta: response });
      sendEvent('turn.completed', turnId, { inputId, resultType: 'success', response });
      break;
    }
    case 'fixture/advance':
      if (!Number.isSafeInteger(p.seconds) || p.seconds < 1 || p.seconds > 3600) {
        error(request.id, -32602, 'Invalid fake clock increment'); break;
      }
      time += p.seconds;
      answer(request.id, { ticked: true }); break;
    case 'fixture/rejectNextRefresh':
      rejectNextRefresh = true; answer(request.id, { armed: true }); break;
    case 'fixture/stats':
      // Return public *counts only*. No token, secret, expiry timestamp or
      // credential contents ever cross the wire.
      answer(request.id, {
        issueCount, refreshAttempts, successfulRefreshes, submissions, completions, failures,
        maxSubmissionsPerInputId: Math.max(0, ...promptCounts.values()),
      }); break;
    case 'session/list':
      answer(request.id, { sessions: [{ sessionId, title: 'Fixture renewal', updatedAt: Date.now() }] }); break;
    case 'session/events':
      answer(request.id, { events: [] }); break;
    case 'session/stop': answer(request.id, { stopped: true }); break;
    default: error(request.id, -32601, 'Unsupported fixture request');
  }
});
cli.on('close', () => process.exit(0));
