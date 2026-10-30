import { basename } from 'node:path';
import { homedir } from 'node:os';
import { clean, redact, wrap, wrapWords, truncate, width, graphemes, cellWidth, VERSION } from '../util.mjs';
import { layoutEditor } from './input.mjs';
import { toolTargetLabel, toolDisplaySummary } from '../tool-activity.mjs';
import { THEMES } from './theme.mjs';
import { formatDuration } from './duration.mjs';
export { THEMES } from './theme.mjs';

// Explicit palettes are WCAG-contrast-tested and owned by ui/theme.mjs.
// Auto leaves the terminal's own canvas/foreground untouched.\nexport function painter(theme = 'auto', color = true, redactContent = true) {
  const t = THEMES[theme] || THEMES.auto;
  return (text, role = 'text', bold = false, selected = false) => {
    const safe = redactContent ? redact(text) : clean(text);
    return color && theme !== 'mono' ? `\x1b[${t.background ? t.background + ';' : ''}${bold ? '1;' : ''}${selected ? '7;' : ''}${t[role] || t.text}m${safe}\x1b[0m` : selected ? `\x1b[7m${safe}\x1b[0m` : safe;
  };
}
function inline(text, role = 'text') {
  const runs = [], regex = /(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^\s)]+\))/g; let at = 0;
  for (const m of text.matchAll(regex)) {
    if (m.index > at) runs.push({ text: text.slice(at, m.index), role });
    if (m[0].startsWith('`')) runs.push({ text: m[0].slice(1, -1), role: 'code' });
    else if (m[0].startsWith('**')) runs.push({ text: m[0].slice(2, -2), role, bold: true });
    else { const link = m[0].match(/^\[([^\]]+)\]\(([^)]+)\)$/); runs.push({ text: link[1], role: 'accent' }); }
    at = m.index + m[0].length;
  }
  if (at < text.length) runs.push({ text: text.slice(at), role });
  return runs.length ? runs : [{ text, role }];
}
function rowsFromRuns(runs, columns, wordWrap = true) {
  columns = Math.max(1, columns);
  const chars = runs.flatMap(run => graphemes(run.text).map(text => ({ ...run, text, cells: cellWidth(text) })));
  const rows = []; let line = [], cells = 0;
  const push = () => {
    const compact = [];
    for (const ch of line) { const prev = compact.at(-1); if (prev && prev.role === ch.role && prev.bold === ch.bold) prev.text += ch.text; else compact.push({ text: ch.text, role: ch.role, bold: ch.bold }); }
    rows.push({ text: line.map(x => x.text).join(''), runs: compact }); line = []; cells = 0;
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (wordWrap && ch.text !== ' ' && (i === 0 || /\s/u.test(chars[i - 1].text))) {
      let length = 0;
      for (let j = i; j < chars.length && !/\s/u.test(chars[j].text); j++) length += chars[j].cells;
      if (cells && length <= columns && cells + length > columns) push();
    }
    if (cells + ch.cells > columns && line.length) push();
    if (wordWrap && !line.length && ch.text === ' ') continue;
    if (ch.cells <= columns) { line.push(ch); cells += ch.cells; }
  }
  push(); return rows;
}
function textRows(text, columns, baseRole = 'text') {
  const rows = [], lines = redact(text).split('\n'); let code = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      code = !code; rows.push({ text: code ? `┌ ${line.trim().slice(3) || 'text'}` : '└', role: 'muted' }); continue;
    }
    if (!code && line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const cells = value => value.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const table = [cells(line)]; i++;
      while (i + 1 < lines.length && lines[i + 1].includes('|') && lines[i + 1].trim()) table.push(cells(lines[++i]));
      const widths = table[0].map((_, j) => Math.min(42, Math.max(...table.map(row => width(row[j] || '')))));
      if (widths.reduce((a, b) => a + b, 0) + 3 * (widths.length - 1) <= columns) {
        table.forEach((row, n) => {
          const value = row.map((cell, j) => truncate(cell, widths[j]) + ' '.repeat(Math.max(0, widths[j] - width(truncate(cell, widths[j]))))).join('   ');
          rows.push(...rowsFromRuns([{ text: value, role: n ? baseRole : 'muted', bold: !n }], columns));
          if (!n) rows.push({ text: widths.map(w => '─'.repeat(w)).join('   '), role: 'faint' });
        });
      } else table.slice(1).forEach(row => { row.forEach((cell, j) => rows.push(...rowsFromRuns([{ text: `${table[0][j]}: `, bold: true, role: baseRole }, ...inline(cell, baseRole)], columns))); rows.push({ text: '' }); });
      continue;
    }
    const heading = !code && line.match(/^#{1,6}\s+(.*)/);
    const value = heading ? heading[1] : line;
    const role = code ? (line.startsWith('+') ? 'success' : line.startsWith('-') ? 'error' : 'code') : heading ? 'accent' : baseRole;
    const runs = code ? [{ text: value, role }] : heading ? [{ text: value, role, bold: true }] : inline(value, role);
    const wrapped = rowsFromRuns(runs, Math.max(1, columns - (code ? 2 : 0)), !code);
    for (const row of wrapped) rows.push(code ? { text: '│ ' + row.text, runs: [{ text: '│ ', role: 'faint' }, ...row.runs] } : row);
  }
  return rows;
}
export function transcriptRows(entries, columns, expanded, cache, expandedTools = new Set()) {
  const output = [], alive = new Set();
  for (const entry of entries) {
    alive.add(entry.id);
    const detail = expanded || expandedTools.has(entry.id);
    const tick = entry.role === 'tool' && entry.status === 'running' ? Math.floor(Date.now() / 1000) : null;
    const signature = [columns, detail, entry.role, entry.text, entry.output, entry.name, entry.status, entry.duration, entry.input,
      entry.description, entry.progressSummary, entry.resultSummary, entry.startedAt, tick];
    let saved = cache?.get(entry.id);
    if (!saved || signature.some((v, i) => v !== saved.signature[i])) {
      const rows = [];
      if (entry.role === 'tool') {
        const symbol = { done: '✓', error: '×', running: '●', queued: '·', cancelled: '○' }[entry.status] || '·';
        const target = toolTargetLabel(entry.input);
        const duration = Number.isFinite(entry.duration) ? `  ${formatDuration(entry.duration)}` : '';
        rows.push({ text: `${detail ? '▾' : '▸'} ${symbol} ${entry.name || 'Tool'}${target ? '  ' + target : ''}${duration}`,
          role: entry.status === 'error' ? 'error' : entry.status === 'done' ? 'muted' : 'accent', toolId: entry.id });
        const activity = toolDisplaySummary(entry);
        if (activity.description) rows.push(...textRows('   Purpose (runtime): ' + activity.description, Math.max(1, columns - 3), 'muted'));
        if (activity.detail) rows.push(...textRows('   ' + activity.detail, Math.max(1, columns - 3),
          entry.status === 'error' ? 'error' : 'muted'));
        if (detail && entry.output) rows.push(...textRows('   Details: ' + entry.output, Math.max(1, columns - 3), 'muted'));
      } else {
        rows.push({ text: '' });
        if (entry.role === 'user') rows.push({ text: 'You', role: 'user', bold: true });
        if (entry.role === 'assistant') rows.push({ text: 'ZC', role: 'accent', bold: true });
        const notice = entry.role === 'notice' || entry.role === 'error';
        rows.push(...textRows((entry.role === 'error' ? '! ' : notice ? '· ' : '') + entry.text, columns, entry.role === 'error' ? 'error' : notice ? 'muted' : 'text'));
      }
      saved = { signature, rows: rows.map((row, index) => ({ ...row, entryId: entry.id, entryRow: index })) }; cache?.set(entry.id, saved);
    }
    output.push(...saved.rows);
  }
  if (cache) for (const key of cache.keys()) if (!alive.has(key)) cache.delete(key);
  return output;
}
function paintRow(row, columns, paint, selection, redactContent = true) {
  const runs = row.runs || [{ text: row.text || '', role: row.role, bold: row.bold }];
  let result = '', cells = 0, group = '', lastStyle = null;
  const flush = () => { if (group) result += paint(group, lastStyle.role, lastStyle.bold, lastStyle.selected); group = ''; };
  for (const run of runs) for (const char of graphemes(redactContent ? redact(run.text) : clean(run.text))) {
    const n = cellWidth(char); if (cells + n > columns) { flush(); return result; }
    const style = { role: run.role || row.role || 'text', bold: run.bold || row.bold, selected: Boolean(selection && cells >= selection[0] && cells < selection[1]) };
    if (!lastStyle || style.role !== lastStyle.role || style.bold !== lastStyle.bold || style.selected !== lastStyle.selected) { flush(); lastStyle = style; }
    group += char; cells += n;
  }
  flush();
  if (selection && selection[1] > cells) result += paint(' '.repeat(Math.min(columns - cells, selection[1] - cells)), 'text', false, true);
  return result;
}
function orderedSelection(selection) {
  if (!selection) return null;
  const { start, end } = selection;
  return start.row < end.row || (start.row === end.row && start.column <= end.column) ? [start, end] : [end, start];
}
export function selectionForRow(selection, row, max) {
  const range = orderedSelection(selection); if (!range) return null;
  const [start, end] = range;
  if (row < start.row || row > end.row) return null;
  return [row === start.row ? start.column : 0, row === end.row ? end.column : max];
}
export function renderFrame(app, columns, terminalRows, color = true) {
  const cols = Math.max(1, columns - 1), height = Math.max(1, terminalRows);
  const theme = app.themePreview || app.config.theme;
  const paint = painter(theme, color), editorPaint = painter(theme, color, false), margin = cols > 160 ? Math.floor((cols - 156) / 2) : Math.min(2, Math.max(0, Math.floor((cols - 24) / 2)));
  const contentWidth = Math.max(4, cols - margin * 2), base = THEMES[theme]?.background;
  const wrapLine = value => color && theme !== 'mono' && base ? `\x1b[${base}m${' '.repeat(margin)}${value}\x1b[${base}m${' '.repeat(Math.max(0, cols - margin - width(value)))}\x1b[0m` : ' '.repeat(margin) + value;
  const line = (text = '', role = 'text', bold = false) => wrapLine(paint(truncate(text, contentWidth), role, bold));
  const pair = (left, right) => { right = truncate(right, Math.max(0, contentWidth - 8)); left = truncate(left, Math.max(1, contentWidth - width(right) - 2)); return left + ' '.repeat(Math.max(1, contentWidth - width(left) - width(right))) + right; };
  // Mixed semantic roles within a status line avoid coloring the whole
  // interface blue or treating guarded and full-access as equivalent states.
  const semanticPair = (left, leftRole, right, rightRole, leftBold = false) => {
    const tail = truncate(right, Math.max(0, contentWidth - 8));
    const head = truncate(left, Math.max(1, contentWidth - width(tail) - 2));
    const space = ' '.repeat(Math.max(1, contentWidth - width(head) - width(tail)));
    return wrapLine(paint(head, leftRole, leftBold) + paint(space, 'text') + paint(tail, rightRole));
  };
  if (height < 14 || columns < 36) {
    const small = ['ZC', 'Resize to at least 36 x 14.', 'Ctrl+C twice to exit.'].slice(0, height).map(s => paint(truncate(s, cols), 'text'));
    while (small.length < height) small.push(''); return { lines: small, cursor: null };
  }
  const path = app.cwd.startsWith(homedir()) ? '~' + app.cwd.slice(homedir().length) : app.cwd;
  const frame = [
    semanticPair(`ZC  ${basename(app.cwd)}${app.branch ? '  [' + app.branch + ']' : ''}`, 'text', `v${VERSION}`, 'faint', true),
    line(path, 'muted'),
    line('─'.repeat(contentWidth), 'border'),
  ];
  const editor = layoutEditor(app.editor, contentWidth - 4), maxEdit = Math.min(10, Math.max(1, Math.floor(height / 3) - 1));
  app.editorStart = Math.max(0, Math.min(app.editorStart || 0, Math.max(0, editor.rows.length - maxEdit)));
  if (editor.cursor.row < app.editorStart) app.editorStart = editor.cursor.row;
  if (editor.cursor.row >= app.editorStart + maxEdit) app.editorStart = editor.cursor.row - maxEdit + 1;
  const editStart = app.editorStart, editRows = editor.rows.slice(editStart, editStart + maxEdit);
  const footerHeight = 5 + Math.max(1, editRows.length), viewportHeight = Math.max(1, height - frame.length - footerHeight);
  let allRows;
  const entries = app.historyEntries || app.state.entries;
  if (!entries.some(e => ['user', 'assistant', 'tool'].includes(e.role))) {
    allRows = [{ text: '' }, { text: 'What are we building?', bold: true }, { text: 'Inspect, change, and test your project in one workspace.', role: 'muted' }, { text: '' },
      { text: '/model  Choose a model       /sessions  Resume work', role: 'muted' }, { text: '/login  Connect your account /help      Shortcuts', role: 'muted' }, { text: '' },
      ...transcriptRows(entries, contentWidth - 2, app.expanded, app.transcriptCache ||= new Map(), app.expandedTools)];
  } else allRows = transcriptRows(entries, contentWidth - 2, app.expanded, app.transcriptCache ||= new Map(), app.expandedTools);
  if (app.anchorScroll && app.scroll > 0 && Number.isFinite(app.totalBodyRows)) app.scroll += Math.max(0, allRows.length - app.totalBodyRows);
  app.anchorScroll = false; app.totalBodyRows = allRows.length;
  app.maxScroll = Math.max(0, allRows.length - viewportHeight);
  if (app.pendingAnchor) {
    const index = allRows.findIndex(row => row.entryId === app.pendingAnchor.entryId && row.entryRow === app.pendingAnchor.entryRow);
    if (index >= 0) app.scroll = Math.max(0, allRows.length - viewportHeight - Math.max(0, index + (app.pendingAnchor.move || 0)));
    app.pendingAnchor = null;
  }
  app.scroll = Math.max(0, Math.min(app.scroll, app.maxScroll));
  const start = Math.max(0, allRows.length - viewportHeight - app.scroll);
  let body = allRows.slice(start, start + viewportHeight), cursor = null;
  app.view = { x: margin, y: frame.length, width: contentWidth - 2, height: viewportHeight, start, rows: allRows };
  app.paletteView = null; app.permissionView = null;
  if (app.permission) {
    const p = app.permission, preview = textRows(`${p.detail || ''}\n\n${p.input || ''}`, contentWidth - 2), available = Math.max(0, viewportHeight - 5);
    p.maxScroll = Math.max(0, preview.length - available); p.scroll = Math.max(0, Math.min(p.scroll || 0, p.maxScroll));
    const allowLabel = clean(p.allowLabel || 'Allow once');
    body = [{ text: 'APPROVAL REQUIRED', role: 'warn', bold: true }, { text: p.title, bold: true }, { text: `Risk: ${p.risk || 'unspecified'}`, role: 'warn' }, ...preview.slice(p.scroll, p.scroll + available),
      { text: p.maxScroll ? `${p.scroll + 1}-${Math.min(preview.length, p.scroll + available)} / ${preview.length} lines. Wheel or PgUp/PgDn scrolls.` : '', role: 'muted' },
      { text: `${p.allow ? '  Deny   [ ' + allowLabel + ' ]' : '[ Deny ]   ' + allowLabel}   ←/→ choose · Enter confirm · Esc deny`, role: 'warn', bold: true }];
    app.permissionView = { x: margin, y: frame.length + Math.min(body.length, viewportHeight) - 1, allowX: margin + 11 };
  } else if (app.palette) {
    const samples = app.palette.themePicker && viewportHeight >= 12 ? [
      { text: '' },
      { text: 'Theme preview', role: 'muted', bold: true },
      { text: 'Primary text  ·  Secondary detail', runs: [
        { text: 'Primary text', role: 'text' }, { text: '  ·  Secondary detail', role: 'muted' },
      ] },
      { text: '✓ Completed    ● Working    ! Attention', runs: [
        { text: '✓ Completed', role: 'success' }, { text: '    ● Working', role: 'accent' },
        { text: '    ! Attention', role: 'warn' },
      ] },
    ] : [];
    const selected = Math.min(app.palette.index, Math.max(0, app.palette.matches.length - 1));
    const limit = Math.max(1, viewportHeight - 4 - samples.length);
    const first = Math.max(0, selected - limit + 1);
    body = [{ text: app.palette.title || 'COMMANDS', role: 'accent', bold: true },
      { text: `› ${app.palette.query || 'Type to filter'}`, role: app.palette.query ? 'text' : 'muted' }, { text: '' },
      ...app.palette.matches.slice(first, first + limit).map((item, i) => ({
        text: `${first + i === selected ? '›' : ' '} ${item.name}  ${item.description || ''}`,
        role: item.disabled ? 'muted' : first + i === selected ? 'accent' : 'text', bold: first + i === selected,
      })), ...samples,
      { text: app.palette.themePicker ? '↑/↓ preview · Enter apply · Esc cancel' : '↑/↓ select · Enter open · Esc close', role: 'muted' }];
    app.paletteView = { x: margin, y: frame.length + 3, first, count: Math.min(limit, app.palette.matches.length - first) };
    cursor = { row: 5, column: margin + 3 + Math.min(width(app.palette.query), contentWidth - 4) };
  }
  body = body.slice(0, viewportHeight);
  for (let i = 0; i < viewportHeight; i++) {
    const row = body[i] || { text: '' };
    let rendered = paintRow(row, contentWidth - 2, paint, !app.permission && !app.palette ? selectionForRow(app.transcriptSelection, start + i, width(row.text || '')) : null);
    if (!app.permission && !app.palette && app.maxScroll > 0) {
      const barSize = Math.max(1, Math.floor(viewportHeight * viewportHeight / allRows.length)), pos = Math.floor((viewportHeight - barSize) * start / Math.max(1, app.maxScroll));
      rendered += paint(' '.repeat(Math.max(0, contentWidth - 1 - width(rendered))) + (i >= pos && i < pos + barSize ? '┃' : '│'), i >= pos && i < pos + barSize ? 'muted' : 'faint');
    }
    frame.push(wrapLine(rendered));
  }
  const mode = app.state.mode || app.config.mode, fullAccess = app.config.backend === 'native' && !app.demo && mode === 'yolo';
  const unconfirmed = mode === 'unknown', phase = app.state.phase;
  const status = ['disconnected', 'uncertain'].includes(phase) ? '! ' + (app.state.detail || 'Connection needs attention') : app.busy ? '● ' + (app.state.detail || 'Working') : '○ Ready';
  const elapsed = app.busy && app.turnStarted ? ` · ${formatDuration(Math.max(0, Date.now() - app.turnStarted))}` : '';
  const modeLabel = app.demo ? 'OFFLINE DEMO' : fullAccess ? 'YOLO / FULL ACCESS' : unconfirmed ? 'MODE UNCONFIRMED' : app.config.backend === 'native-stream' ? 'guarded, no approvals' : app.state.runtimeMode === 'guarded' ? 'GUARDED' : String(mode).toUpperCase();
  const scrollLabel = app.scroll || app.historyEntries ? ' · HISTORY  Ctrl+End: live' : '';
  const statusRole = ['uncertain', 'disconnected'].includes(phase) ? 'error' : app.busy ? 'accent' : 'success';
  const modeRole = fullAccess || unconfirmed ? 'warn' : app.demo ? 'muted' : 'success';
  const rightStatus = modeLabel + scrollLabel;
  const availableStatusWidth = Math.max(1, contentWidth - width(truncate(rightStatus, Math.max(0, contentWidth - 8))) - 2);
  // Narrow terminals must retain elapsed time rather than truncating the
  // essential 2m/3h/4d signal behind a long phase description.
  let leftStatus = status + elapsed;
  if (app.busy && elapsed && width(leftStatus) > availableStatusWidth) {
    const timer = formatDuration(Math.max(0, Date.now() - app.turnStarted));
    leftStatus = `● Working · ${timer}`;
    if (width(leftStatus) > availableStatusWidth) leftStatus = `● ${timer}`;
  }
  frame.push(semanticPair(leftStatus, statusRole, rightStatus, modeRole));
  const selected = app.editor.selection ? ` · ${app.editor.selection[1] - app.editor.selection[0]} selected` : '';
  const draftLabel = ` Prompt${editor.rows.length > 1 ? ' · ' + (editStart + 1) + '-' + Math.min(editStart + editRows.length, editor.rows.length) + '/' + editor.rows.length : ''}${selected} `;
  const draftTitle = truncate(draftLabel, contentWidth - 4);
  const borderStyle = fullAccess ? 'warn' : 'border';
  frame.push(wrapLine(
    paint('╭─', borderStyle) +
    paint(draftTitle, fullAccess ? 'warn' : app.focus === 'transcript' ? 'muted' : 'accent') +
    paint('─'.repeat(Math.max(0, contentWidth - width(draftTitle) - 3)) + '╮', borderStyle)
  ));
  const inputRow = frame.length;
  for (let n = 0; n < editRows.length; n++) {
    const rowIndex = editStart + n, text = editRows[n];
    let selection = null;
    if (app.editor.selection) {
      const [a, b] = app.editor.selection, positions = editor.positions;
      if (rowIndex >= positions[a].row && rowIndex <= positions[b].row) selection = [rowIndex === positions[a].row ? positions[a].column : 0, rowIndex === positions[b].row ? positions[b].column : width(text) + 1];
    }
    const value = !app.editor.text ? paint(truncate('Ask about your project, or type /help', contentWidth - 4), 'muted') : paintRow({ text }, contentWidth - 4, editorPaint, selection, false);
    frame.push(wrapLine(paint('│ ', 'border') + value + paint(' '.repeat(Math.max(0, contentWidth - 3 - width(value))) + '│', 'border')));
  }
  frame.push(line('╰' + '─'.repeat(contentWidth - 2) + '╯', 'border'));
  const hints = contentWidth > 100 ? 'Enter send · Alt+Enter newline · Ctrl+A select all · Ctrl+R history · Ctrl+P commands' : 'Enter send · Ctrl+A select all · Ctrl+P commands';
  frame.push(line(pair(hints, app.busy ? 'Esc stop' : 'Wheel scroll'), 'muted'));
  const usage = app.state.usage?.total_tokens ?? app.state.usage?.totalTokens;
  const model = app.state.model || 'No model selected. /login or /model';
  frame.push(line(pair(app.toast || model, Number.isFinite(usage) ? `${usage.toLocaleString()} tokens` : ''), app.toast ? 'warn' : 'muted'));
  app.composer = { x: margin + 2, y: inputRow, width: contentWidth - 4, height: editRows.length, start: editStart, layout: editor };
  if (!cursor && !app.permission && app.focus !== 'transcript') cursor = { row: inputRow + 1 + editor.cursor.row - editStart, column: margin + 3 + editor.cursor.column };
  return { lines: frame.slice(0, height), cursor: cursor ? { row: Math.min(height, cursor.row), column: Math.min(cols, cursor.column) } : null };
}
export class Screen {
  constructor(output) { this.output = output; this.previous = []; this.active = false; this.mouse = true; }
  enter() { this.active = true; this.output.write('\x1b[?1049h\x1b[?2004h\x1b[?25l\x1b[2J\x1b[H'); this.setMouse(this.mouse); this.output.write('\x1b]11;?\x07'); }
  setMouse(enabled) { this.mouse = enabled; if (this.active) this.output.write(enabled ? '\x1b[?1002h\x1b[?1006h' : '\x1b[?1002l\x1b[?1006l'); }
  paint(frame) {
    if (!this.active || this.output.writableLength > 1024 * 1024) return;
    let changes = '\x1b[?2026h\x1b[?25l';
    for (let i = 0; i < frame.lines.length; i++) if (frame.lines[i] !== this.previous[i]) changes += `\x1b[${i + 1};1H\x1b[2K${frame.lines[i] || ''}`;
    if (frame.cursor) changes += `\x1b[${frame.cursor.row};${frame.cursor.column}H\x1b[?25h`;
    changes += '\x1b[?2026l'; this.output.write(changes); this.previous = [...frame.lines];
  }
  invalidate() { this.previous = []; if (this.active) this.output.write('\x1b[2J'); }
  leave() { if (!this.active) return; this.active = false; this.output.write('\x1b[0m\x1b[?25h\x1b[?1002l\x1b[?1006l\x1b[?2004l\x1b[?2026l\x1b[?1049l'); }
}
