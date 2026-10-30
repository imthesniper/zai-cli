import test from 'node:test';
import assert from 'node:assert/strict';
import { toolTargetLabel, runtimeToolDescription, toolResultLine,
  toolProgressLine, toolDisplaySummary } from '../src/tool-activity.mjs';
import { NativeBackend } from '../src/backends/native.mjs';
import { validateConfig } from '../src/config.mjs';
import { WorkspaceState } from '../src/state.mjs';
import { transcriptRows } from '../src/ui/render.mjs';

test('inline summaries show verifiable tool facts, not a fabricated reason', () => {
  assert.equal(toolDisplaySummary({status:'queued'}).detail,'Queued');
  assert.equal(toolDisplaySummary({status:'running',startedAt:1000},6500).detail,'Running 5s');
  assert.equal(toolDisplaySummary({status:'done'}).detail,'Completed (expand for results)');
  assert.equal(toolDisplaySummary({status:'error'}).detail,'Failed (expand for details)');
  assert.equal(toolDisplaySummary({status:'cancelled'}).detail,'Cancelled');
  assert.equal(toolDisplaySummary({status:'running',startedAt:1000,progressSummary:'12 output bytes'},6500).detail,
    'Running 5s · 12 output bytes');
  assert.equal(toolDisplaySummary({status:'done',description:'Checked the parser',
    resultSummary:'Exit 0'}).description,'Checked the parser');
  assert.equal(toolDisplaySummary({status:'running'}).description,undefined);
});

test('tool labels redact bearer values and reject non-text or control sequences', () => {
  assert.equal(toolTargetLabel({path:'src/hello.ts'}),'src/hello.ts');
  assert.equal(toolTargetLabel({command:'curl -H "Bearer secretTOKEN" example.test'}),
    'curl -H "Bearer [REDACTED]" example.test');
  assert.equal(runtimeToolDescription('Review\x1b[2J the parser\n then test'), 'Review the parser then test');
  assert.equal(runtimeToolDescription({why:'not a string'}),undefined);
  assert.ok(toolTargetLabel({command:'z'.repeat(900)}).length <= 140);
});

test('result summaries expose known status and output byte count, not raw potentially sensitive results', () => {
  const text='my_private_token=very-secret';
  const result={exitCode:0,display:{kind:'bash_output',output:text,truncated:false}};
  assert.equal(toolResultLine(result),`Exit 0 · ${Buffer.byteLength(text)} output bytes (expand to inspect)`);
  assert.equal(toolResultLine({stdout:'ok'}),'2 output bytes (expand to inspect)');
  assert.equal(toolResultLine({status:'success'}),'Result received (expand for details)');
  assert.equal(toolResultLine(null),'Result received (expand for details)');
  assert.doesNotMatch(toolResultLine(result), /very-secret/);
  assert.equal(toolProgressLine({elapsedMs:2100,stdoutBytes:101,stderrBytes:4}),
    '2s elapsed · 101 stdout bytes · 4 stderr bytes');
  assert.equal(toolProgressLine({}),undefined);
  assert.equal(toolProgressLine({elapsedMs:1010,outputBytes:50,stdoutBytes:30}), '1s elapsed · 50 output bytes');
  assert.equal(toolResultLine({display:{kind:'bash_output',output:'x',truncated:true}}),
    '1 visible output bytes (truncated) (expand to inspect)');
});

test('upstream event metadata survives into ZC and collapsed tool rows stay readable', () => {
  const state = new WorkspaceState();
  const native = new NativeBackend({
    cwd:process.cwd(),config:validateConfig({}),
    emit: event => state.apply(event),ask:async()=>false
  });
  native.session={sessionId:'fixture-session'};
  const notify=(seq,type,payload)=>native.notification('session/event',{
    sessionId:'fixture-session',seq,type,payload
  });
  notify(1,'tool.updated',{kind:'scheduled',toolCallId:'tool-1',toolName:'Bash',
    input:{command:'node --test test/parser.test.mjs'},
    description:'Run the parser regression tests'});
  notify(2,'tool.updated',{kind:'started',toolCallId:'tool-1',toolName:'Bash'});
  notify(3,'tool.updated',{kind:'progress',toolCallId:'tool-1',elapsedMs:5000,
    stdoutBytes:200,stdoutTail:'private-output-please-expand'});
  let entry=state.entries.find(x=>x.id==='tool-1');
  assert.equal(entry.description,'Run the parser regression tests');
  assert.equal(entry.progressSummary,'5s elapsed · 200 stdout bytes');
  assert.equal(entry.status,'running');
  assert.equal(entry.input.command,'node --test test/parser.test.mjs');
  let rows=transcriptRows(state.entries,100,false,new Map()).map(x=>x.text).join('\n');
  assert.match(rows,/Purpose \(runtime\): Run the parser regression tests/);
  assert.match(rows,/Running \d+s/);
  assert.doesNotMatch(rows,/private-output-please-expand/);
  notify(4,'model.streaming',{kind:'reasoning_delta',delta:'private_internal_reasoning'});
  rows=transcriptRows(state.entries,100,false,new Map()).map(x=>x.text).join('\n');
  assert.doesNotMatch(rows,/private_internal_reasoning/);
  notify(5,'tool.updated',{kind:'result',toolCallId:'tool-1',toolName:'Bash',
    result:{exitCode:0,display:{kind:'bash_output',output:'sensitive_tool_response',truncated:false}},duration:5412});
  entry=state.entries.find(x=>x.id==='tool-1');
  assert.equal(entry.status,'done');
  assert.equal(entry.duration,5412);
  rows=transcriptRows(state.entries,100,false,new Map()).map(x=>x.text).join('\n');
  assert.match(rows,/Exit 0/);
  assert.match(rows,/\d+ output bytes/);
  assert.doesNotMatch(rows,/sensitive_tool_response|private_internal_reasoning/);
  const expanded=transcriptRows(state.entries,100,true,new Map()).map(x=>x.text).join('\n');
  assert.match(expanded,/sensitive_tool_response/);
});

test('tool progress changes and elapsed seconds invalidate transcript cache', () => {
  const cache=new Map();
  const state=new WorkspaceState();
  state.apply({type:'tool',id:'one',name:'Bash',status:'running',startedAt:1000,
    progressSummary:'1 output byte'});
  const a=transcriptRows(state.entries,80,false,cache);
  assert.match(a.map(x=>x.text).join(' '),/1 output byte/);
  state.apply({type:'tool',id:'one',status:'running',progressSummary:'10 output bytes'});
  const b=transcriptRows(state.entries,80,false,cache);
  assert.match(b.map(x=>x.text).join(' '),/10 output bytes/);
  assert.equal(state.entries.length,1);
});
