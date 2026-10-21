// Deterministic legacy-v1 fixture: session/create with a model is supported;
// later session/setModel deliberately rejects it. No network or account data.
import { createInterface } from 'node:readline';
const sessionId = 'native-create-model-fixture';
let model, mode = 'guarded', seq = 0, createdWithModel = false, setModelCalls = 0, turns = 0;
const write = data => process.stdout.write(JSON.stringify(data) + '\n');
const reply = (id, result) => write({ id, result });
const error = (id, code, message) => write({ id, error: { code, message } });
const options = [{ ref: { providerId: 'fixture-account', modelId: 'GLM-5.3' }, label: 'Fixture account model',
  reasoning: { defaultLevel: 'standard', levels: [{ value: 'standard', label: 'Standard' }] } }];
const snapshot = () => ({
  protocol: { name: 'ZCode Protocol', version: 1 },
  session: { sessionId, mode, ...(model ? { model } : {}) },
  messages: [],
  settings: { model: { available: options, ...(model ? { current: model } : {}) } },
  runtime: { mainActive: false }, projection: { status: 'idle' },
});
const event = (type, turnId, payload) => write({ method: 'session/event', params: {
  sessionId, turnId, seq: ++seq, type, payload, timestamp: Date.now(),
} });
const rl = createInterface({ input: process.stdin });
rl.on('line', text => {
  const r = JSON.parse(text), p = r.params || {};
  switch (r.method) {
    case 'session/create':
      mode = p.mode;
      createdWithModel = Boolean(p.model);
      if (p.model?.modelId === 'reject') { error(r.id, -32602, 'Fixture rejected initial model'); break; }
      model = p.model ? (p.model.modelId === 'mismatch'
        ? { providerId: 'fixture-account', modelId: 'other' }
        : { ...p.model, options: { reasoningLevel: 'standard' } }) : undefined;
      reply(r.id, snapshot()); break;
    case 'session/subscribe':
      reply(r.id, { sessionId, eventSeq: seq, events: [], snapshot: snapshot() }); break;
    case 'session/read': reply(r.id, snapshot()); break;
    case 'session/setModel':
      setModelCalls++; error(r.id, -32021, 'Fixture refuses post-create setModel'); break;
    case 'session/send': {
      if (!model) { error(r.id, -32022, 'Fixture has no model'); break; }
      const turnId = 'fixture-turn-' + (++turns);
      reply(r.id, { sessionId, turnId, accepted: true });
      event('turn.started', turnId, { inputId: p.inputId, input: p.content });
      event('model.streaming', turnId, { kind: 'text_delta', assistantMessageId: 'answer-' + turns, delta: 'Native initial model accepted.' });
      event('turn.completed', turnId, { inputId: p.inputId, response: 'Native initial model accepted.', resultType: 'success' });
      break;
    }
    case 'fixture/stats': reply(r.id, { createdWithModel, setModelCalls, turns }); break;
    default: reply(r.id, {});
  }
});
rl.on('close', () => process.exit(0));
