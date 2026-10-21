// Stand-in legacy-v1 ZCode server requiring a reasoning level for
// structured session/setModel. It mirrors upstream Registry validation and
// rejects the failed session/create(model) shortcut. No network required.
import { createInterface } from 'node:readline';
const sid = 'fixture-native-reasoning';
let seq = 0, mode = 'guarded', model, setModelCalls = 0, failedSelections = 0, turns = 0;
const write = value => process.stdout.write(JSON.stringify(value) + '\n');
const reply = (id, result) => write({ id, result });
const error = (id, code, message) => write({ id, error: { code, message } });
const available = [
  { ref: { providerId: 'fixture-account', modelId: 'GLM-5.3' },
    label: 'GLM-5.3', reasoning: { defaultLevel: 'high',
      levels: [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }] } },
];
const snapshot = () => ({
  protocol: { name: 'ZCode Protocol', version: 1 },
  session: { sessionId: sid, mode, ...(model ? { model } : {}) },
  messages: [], settings: { model: { available, ...(model ? { current: model } : {}) } },
  runtime: { mainActive: false }, projection: { status: 'idle' },
});
const event = (type, turnId, payload) => write({ method: 'session/event', params: {
  sessionId: sid, turnId, seq: ++seq, timestamp: Date.now(), type, payload,
} });
const rl = createInterface({ input: process.stdin });
rl.on('line', value => {
  const req = JSON.parse(value), p = req.params || {};
  switch (req.method) {
    case 'session/create':
      if (p.model) { error(req.id, -32603, 'Fixture does not support setting model at creation'); break; }
      mode = p.mode || 'guarded'; reply(req.id, snapshot()); break;
    case 'session/resume': reply(req.id, snapshot()); break;
    case 'session/subscribe':
      reply(req.id, { sessionId: sid, eventSeq: seq, events: [], snapshot: snapshot() }); break;
    case 'session/read': reply(req.id, snapshot()); break;
    case 'session/setModel': {
      setModelCalls++;
      const selected = p.model;
      if (!selected?.options?.reasoningLevel || !['low', 'high'].includes(selected.options.reasoningLevel) ||
          selected.providerId !== 'fixture-account' || selected.modelId !== 'GLM-5.3') {
        failedSelections++; error(req.id, -32603, 'Fixture requires an advertised reasoning level'); break;
      }
      model = selected; reply(req.id, snapshot()); break;
    }
    case 'session/send': {
      if (!model) { error(req.id, -32603, 'Fixture model missing'); break; }
      const turnId = 'turn-' + (++turns);
      reply(req.id, { accepted: true, sessionId: sid, turnId });
      event('turn.started', turnId, { inputId: p.inputId, input: p.content });
      event('model.streaming', turnId, { kind: 'text_delta', assistantMessageId: 'answer-' + turns, delta: 'ZC_AUTH_LIFECYCLE_OK' });
      event('turn.completed', turnId, { inputId: p.inputId, response: 'ZC_AUTH_LIFECYCLE_OK', resultType: 'success' });
      break;
    }
    case 'fixture/stats': reply(req.id, { setModelCalls, failedSelections, turns,
      reasoningLevel: model?.options?.reasoningLevel || null }); break;
    default: reply(req.id, {});
  }
});
rl.on('close', () => process.exit(0));
