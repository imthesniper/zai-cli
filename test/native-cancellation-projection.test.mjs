import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeActivity } from '../src/backends/native-contract.mjs';
import { nativeCancellationIdle, awaitNativeCancellationIdle, cancellationVerdict,
  parseLiveOptions } from '../scripts/live-production-check.mjs';

const snapshot = ({ projectionStatus = 'idle', activeTurnId, permissionCount = 0,
  toolCount = 0, legacyMainActive } = {}) => ({
  session: { sessionId: 'fixture', mode: 'guarded' },
  runtime: {
    ...(activeTurnId ? { activeTurnId } : {}),
    ...(legacyMainActive === undefined ? {} : { mainActive: legacyMainActive }),
  },
  projection: { status: projectionStatus,
    pendingPermissions: Array.from({ length: permissionCount }, () => ({})),
    activeToolCalls: Array.from({ length: toolCount }, () => ({})) },
});
const state = (changes = {}) => ({
  connection: 'open', status: 'idle', mainActive: false, frontendTurn: false,
  pendingPermissions: 0, activeToolCalls: 0, backgroundJobs: 0, ...changes,
});

test('native protocol activity is derived from activeTurnId and authoritative projection', () => {
  assert.deepEqual(nativeActivity(snapshot()), { status: 'idle', mainActive: false });
  assert.deepEqual(nativeActivity(snapshot({ activeTurnId: 'turn-1' })),
    { status: 'idle', mainActive: true });
  assert.deepEqual(nativeActivity(snapshot({ projectionStatus: 'running' })),
    { status: 'running', mainActive: true });
  assert.deepEqual(nativeActivity(snapshot({ projectionStatus: 'waiting' })),
    { status: 'waiting', mainActive: true });
  assert.equal(nativeActivity(snapshot({permissionCount:1})).mainActive, undefined);
  assert.equal(nativeActivity(snapshot({toolCount:1})).mainActive, undefined);
  assert.equal(nativeActivity(snapshot({projectionStatus:'unknown'})).mainActive, undefined);
  assert.equal(nativeActivity(snapshot({legacyMainActive:false})).mainActive, false);
  assert.equal(nativeActivity(snapshot({legacyMainActive:true})).mainActive, true);
  assert.equal(nativeActivity(null).mainActive, undefined);
});

test('live cancellation refuses missing, uncertain or active runtime state', () => {
  assert.equal(nativeCancellationIdle(state()), true);
  for (const fields of [
    { connection:'closed' }, { status:'running' }, { status:'waiting' },
    { status:'unknown' }, { mainActive:undefined }, { mainActive:true },
    { frontendTurn:true }, { pendingPermissions:1 }, { activeToolCalls:1 },
    { backgroundJobs:1 },
  ]) assert.equal(nativeCancellationIdle(state(fields)), false, JSON.stringify(fields));
});

test('cancellation needs two independent stable idle reads, not one transient response', async () => {
  let n=0;
  const sequence=[state({mainActive:true}), state(), state({status:'running'}), state(), state()];
  assert.equal(await awaitNativeCancellationIdle(async () => sequence[n++], {
    maxChecks: 5, intervalMs:0, pause:async()=>{}
  }), true);
  assert.equal(n, 5);
  assert.equal(await awaitNativeCancellationIdle(async () => state(), {
    maxChecks: 2, intervalMs:0, pause:async()=>{}
  }), true);
  let checks=0;
  assert.equal(await awaitNativeCancellationIdle(async()=>{
    checks++;
    return checks%2 ? state() : state({mainActive:true});
  }, { maxChecks: 6, intervalMs:0, pause:async()=>{} }), false);
});

test('cancellation verdict requires active shell tool, acknowledged stop, abort and idle', () => {
  const all={turnStarted:true,toolStarted:true,stopSent:true,stopAcknowledged:true,
    aborted:true,idleConfirmed:true,completed:false};
  assert.deepEqual(cancellationVerdict(all), {
    status:'PASS',reason:'ACTIVE_TOOL_ABORTED_STOP_ACKNOWLEDGED_IDLE_CONFIRMED'
  });
  for (const [field,reason] of [
    ['turnStarted','TURN_START_NOT_CONFIRMED'],
    ['toolStarted','LONG_RUNNING_TOOL_NOT_OBSERVED'],
    ['stopSent','STOP_NOT_SENT'], ['stopAcknowledged','STOP_NOT_ACKNOWLEDGED'],
    ['aborted','ABORT_NOT_CONFIRMED'], ['idleConfirmed','RUNTIME_IDLE_NOT_CONFIRMED'],
  ]) {
    const verdict=cancellationVerdict({...all,[field]:false});
    assert.equal(verdict.status,'INCONCLUSIVE');
    assert.equal(verdict.reason,reason);
  }
  assert.equal(cancellationVerdict({...all,completed:true}).reason,'TURN_COMPLETED_BEFORE_STOP');
});

test('opt-in cancellation-only mode requires a fresh container login and no long delay', () => {
  assert.equal(parseLiveOptions([]).cancellationOnly,false);
  assert.equal(parseLiveOptions(['--cancellation-only']).cancellationOnly,true);
  assert.throws(()=>parseLiveOptions(['--cancellation-only','--continuity-minutes','75']),
    /either --cancellation-only/);
  assert.throws(()=>parseLiveOptions(['--no-login']),/Usage/);
});
