import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { parseLiveOptions, safePermissionTarget, resultCategory } from '../scripts/live-production-check.mjs';

test('live production test options are explicit and bounded', () => {
  assert.equal(parseLiveOptions([]).continuityMinutes, 0);
  assert.equal(parseLiveOptions(['--continuity-minutes','75']).continuityMinutes, 75);
  assert.equal(parseLiveOptions(['--model','account:zai-individual-coding-plan/GLM-5.3']).model,
    'account:zai-individual-coding-plan/GLM-5.3');
  for (const args of [
    ['--continuity-minutes', '-1'], ['--continuity-minutes','121'],
    ['--continuity-minutes','NaN'], ['--model','x'], ['--unsafe'], ['--mode','yolo'],
  ]) assert.throws(() => parseLiveOptions(args));
});
test('live file-approval policy only matches a single intended path and operation', t => {
  if (process.platform === 'win32') {
    t.skip('Live editing is Linux Docker-only; Windows cannot supply POSIX container paths.');
    return;
  }
  const workspace = resolve('/tmp', 'zc-workspace-fixture');
  const edit = join(workspace, 'draft.txt');
  const req = (title, payload) => ({ title, input: JSON.stringify(payload) });
  assert.equal(safePermissionTarget(req('Allow Edit?',{file_path:'draft.txt'}), workspace, [edit]),true);
  assert.equal(safePermissionTarget(req('Allow Write?',{path:edit}), workspace, [edit]),true);
  for(const r of [
    req('Allow Bash?',{file_path:'draft.txt'}),
    req('Enable YOLO?',{file_path:'draft.txt'}),
    req('Allow Edit?',{file_path:'../secret.txt'}),
    req('Allow Edit?',{file_path:'/etc/passwd'}),
    req('Allow Edit?',{file_path:'other.txt'}),
    req('Allow Edit?',{path:'draft.txt', file_path:'draft.txt'}),
    { title:'Allow Edit?', input:'not JSON'},
    req('Allow Edit?',{file_path:'draft.txt\nother.txt'}),
    req('Allow Edit?',{file_path:'draft.txt\\other.txt'}),
  ]) assert.equal(safePermissionTarget(r,workspace,[edit]),false,JSON.stringify(r));
  assert.equal(safePermissionTarget(req('Allow Edit?',{file_path:'draft.txt'}),workspace,[]),false);
});
test('live result classifier returns only stable labels, never secrets', () => {
  assert.equal(resultCategory(Object.assign(new Error('cancelled'),{name:'AbortError'})),'ABORTED');
  assert.equal(resultCategory(new Error('Session not found')),'SESSION_NOT_PERSISTED');
  assert.equal(resultCategory(new Error('model not configured')),'MODEL_SELECTION');
  for(const m of ['Bearer account-secret','Authorization: secret','SENSITIVE']) {
    const label = resultCategory(new Error(m));
    assert.ok(['OTHER_FAILURE','ACCOUNT_ACCESS'].includes(label));
    assert.doesNotMatch(label, /secret|Bearer|Authorization|SENSITIVE/i);
  }
});
test('container live test does not run at import time', () => {
  assert.equal(typeof parseLiveOptions,'function');
});
