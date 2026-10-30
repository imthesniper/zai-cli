import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { formatDuration } from '../src/ui/duration.mjs';
import { contrastRatio, hexToRgb, THEME_COLORS, THEMES } from '../src/ui/theme.mjs';
import { renderFrame, painter } from '../src/ui/render.mjs';
import { toolDisplaySummary } from '../src/tool-activity.mjs';
import { TerminalApp } from '../src/ui/app.mjs';
import { validateConfig } from '../src/config.mjs';
import { clean, width } from '../src/util.mjs';

test('elapsed time transitions cleanly through seconds, minutes, hours and days', () => {
  const fixtures = [
    [0,'0s'], [999,'0s'], [1000,'1s'], [59999,'59s'],
    [60000,'1m 00s'], [65000,'1m 05s'], [3599999,'59m 59s'],
    [3600000,'1h 00m'], [3720000,'1h 02m'], [86399999,'23h 59m'],
    [86400000,'1d 00h'], [97200000,'1d 03h'], [259200000,'3d 00h'],
    [10*86400000+23*3600000,'10d 23h'],
  ];
  for (const [ms,label] of fixtures) assert.equal(formatDuration(ms),label,`duration ${ms}`);
  for(const value of [-1,Number.NaN,Infinity,-Infinity,undefined,null,'3600']) {
    assert.equal(formatDuration(value),'n/a');
  }
});
test('live tool durations share the same human units', () => {
  assert.equal(toolDisplaySummary({ status:'running',startedAt:1000 },61000).detail,'Running 1m 00s');
  assert.equal(toolDisplaySummary({ status:'running',startedAt:1000 },3601000).detail,'Running 1h 00m');
  assert.equal(toolDisplaySummary({ status:'running',startedAt:1000 },86401000).detail,'Running 1d 00h');
  assert.equal(toolDisplaySummary({ status:'done',resultSummary:'Exit 0' }).detail,'Exit 0');
});
test('dark and light theme semantics meet text readability thresholds', () => {
  assert.equal(hexToRgb('#A0C4FF').join(','),'160,196,255');
  assert.throws(() => hexToRgb('orange'),/6-digit/);
  assert.ok(Object.isFrozen(THEME_COLORS.dark));
  for(const name of ['dark','light']) {
    const pal=THEME_COLORS[name];
    for (const role of ['text','muted','faint','accent','user','code','success','warn','error']) {
      const ratio=contrastRatio(pal[role],pal.background);
      assert.ok(ratio>=4.5,`${name} ${role} contrast: ${ratio}`);
    }
    assert.ok(contrastRatio(pal.border,pal.background)>=4.5,`${name} border visibility`);
    assert.ok(/^48;2;/.test(THEMES[name].background));
  }
});
test('auto respects the terminal palette, mono and NO_COLOR never force RGB', () => {
  const pal=painter('auto',true);
  assert.equal(pal('hello','text'),'\x1b[39mhello\x1b[0m');
  assert.ok(!pal('hello','muted').includes('48;2'));
  assert.equal(painter('mono',true)('hello'),'hello');
  assert.equal(painter('dark',false)('hello'),'hello');
  assert.match(painter('dark',true)('hello'),/\x1b\[48;2;19;21;26;38;2;/);
});
function createApp(theme='auto') {
  const a=new TerminalApp({
    cwd:process.cwd(),config:validateConfig({theme}),
    input:new PassThrough(),output:new PassThrough()
  });
  a.schedule=()=>{};
  a.screen.invalidate=()=>{};
  return a;
}
test('status timer reports human-sized durations without clipping the 80-column footer', () => {
  const a=createApp('dark');
  a.busy=true;
  a.state.apply({type:'status',phase:'working',detail:'Waiting for the model'});
  for(const [elapsed,label] of [[65000,'1m 05s'],[3720000,'1h 02m'],[97200000,'1d 03h']]) {
    a.turnStarted=Date.now()-elapsed;
    const frame=renderFrame(a,80,24,true);
    assert.ok(frame.lines.some(line=>clean(line).includes(`Waiting for the model · ${label}`)),label);
    assert.equal(frame.lines.length,24);
    for(const line of frame.lines) assert.ok(width(line)<=79,`overflow: ${clean(line)}`);
  }
});
test('running status uses monotonic elapsed time when the wall clock is disturbed', () => {
  const a=createApp('light');
  a.busy=true;
  a.state.apply({type:'status',phase:'working',detail:'Waiting for the model'});
  a.turnStarted=Date.now()-2000;
  a.turnStartedMonotonic=performance.now()-3720000;
  const frame=renderFrame(a,80,24,true);
  const visible=frame.lines.map(clean).join(' ');
  assert.ok(visible.includes('1h 02m'));
  assert.ok(!visible.includes('Waiting for the model · 2s'));
});
test('semantic hierarchy survives narrow and wide terminals across every theme', () => {
  for(const theme of ['auto','dark','light','mono']) for(const [cols,rows] of [[36,14],[60,16],[80,24],[120,32],[180,46]]) {
    const a=createApp(theme);
    a.state.apply({type:'message',id:'user1',role:'user',text:'Create a simple plan for today.'});
    a.state.apply({type:'message',id:'assistant1',role:'assistant',text:'I will inspect the code and run tests.'});
    a.busy=true; a.turnStarted=Date.now()-125000;
    a.state.apply({type:'status',phase:'working',detail:'Waiting for the model'});
    const frame=renderFrame(a,cols,rows,true);
    assert.equal(frame.lines.length,rows,`${theme} ${cols}x${rows}`);
    for(const line of frame.lines) assert.ok(width(line)<=cols-1,`${theme}: ${clean(line)}`);
    const all=frame.lines.join('\n');
    if (cols>=36 && rows>=14) {
      assert.ok(all.includes('╭─'),theme);
      assert.ok(clean(all).includes('2m 05s'),theme);
    }
    if(theme==='auto'||theme==='mono') assert.ok(!all.includes('\x1b[48;2'),theme);
    if(theme==='mono') assert.ok(!all.includes('\x1b['),theme);
    if(theme==='dark'||theme==='light') assert.ok(all.includes(THEMES[theme].background),theme);
  }
});
test('theme picker previews before commit and Escape preserves the original theme', async () => {
  const a=createApp('mono');
  await a.command('/theme');
  assert.equal(a.palette.themePicker,true);
  assert.equal(a.themePreview,'mono');
  assert.equal(a.config.theme,'mono');
  a.handleKey({key:'up'});
  assert.equal(a.themePreview,'light');
  const light=renderFrame(a,80,24,true).lines.join('\n');
  assert.ok(light.includes(THEMES.light.background));
  assert.ok(clean(light).includes('Theme preview'));
  assert.equal(a.config.theme,'mono');
  a.handleKey({key:'up'});
  assert.equal(a.themePreview,'dark');
  assert.ok(renderFrame(a,80,24,true).lines.join('\n').includes(THEMES.dark.background));
  a.handleKey({key:'escape'});
  assert.equal(a.themePreview,undefined);
  assert.equal(a.config.theme,'mono');
  assert.equal(a.palette,null);
  assert.ok(!renderFrame(a,80,24,true).lines.join('\n').includes('\x1b[48;2'));
});
test('terminal background replies never flash the screen when auto inherits the palette', () => {
  const a=createApp('auto');
  let invalidations=0, renders=0;
  a.screen.invalidate=()=>{ invalidations++; };
  a.schedule=()=>{ renders++; };
  a.handleKey({background:[0.2,0.2,0.2]});
  assert.equal(invalidations,0);
  assert.equal(renders,0);
});
test('an active model turn can preview themes by mouse without changing permissions or saving', async () => {
  const a=createApp('dark');
  a.busy=true;
  a.turnStarted=Date.now()-65000;
  await a.command('/theme');
  const view=renderFrame(a,100,30,true);
  assert.equal(view.lines.length,30);
  assert.equal(a.palette.themePicker,true);
  const area=a.paletteView;
  a.handleMouse({action:'press',button:0,x:area.x+4,y:area.y+2});
  assert.equal(a.themePreview,'light');
  assert.equal(a.config.theme,'dark');
  assert.equal(a.busy,true);
  assert.ok(renderFrame(a,100,30,true).lines.join('').includes(THEMES.light.background));
  a.handleKey({key:'escape'});
  assert.equal(a.themePreview,undefined);
  assert.equal(a.config.theme,'dark');
  assert.equal(a.busy,true);
});
test('switching out of mono restores color without restarting and direct /theme persists', async t => {
  const folder=await mkdtemp(join(tmpdir(),'zc-theme-fixture-'));
  const original=process.env.ZC_HOME;
  process.env.ZC_HOME=folder;
  t.after(async()=>{if(original===undefined)delete process.env.ZC_HOME;else process.env.ZC_HOME=original;await rm(folder,{recursive:true,force:true});});
  const a=createApp('mono');
  // The color capability is terminal-specific, not a snapshot of the active theme.
  if (!Object.hasOwn(process.env,'NO_COLOR')) assert.equal(a.color,true);
  await a.command('/theme dark');
  assert.equal(a.config.theme,'dark');
  assert.ok(renderFrame(a,80,24,true).lines.join('\n').includes(THEMES.dark.background));
  assert.equal(JSON.parse(await readFile(join(folder,'config.json'),'utf8')).theme,'dark');
  await a.command('/theme auto');
  assert.equal(a.config.theme,'auto');
  assert.ok(!renderFrame(a,80,24,true).lines.join('\n').includes('48;2'));
  await a.command('/theme mono');
  assert.equal(a.config.theme,'mono');
  assert.ok(!renderFrame(a,80,24,true).lines.join('\n').includes('\x1b['));
});
test('theme picker menu keeps a readable preview and click targets at normal dimensions', async () => {
  const a=createApp('dark');
  await a.command('/theme');
  const frame=renderFrame(a,100,30,true);
  const body=frame.lines.map(clean).join('\n');
  for(const role of ['Terminal native','Graphite','Paper','Monochrome','Theme preview','Completed','Working','Attention']) {
    assert.ok(body.includes(role),`missing ${role}`);
  }
  assert.ok(a.paletteView.count>=4);
  assert.equal(a.config.theme,'dark');
});
