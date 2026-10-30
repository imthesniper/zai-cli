import { bounded, clean, isRecord, redact } from './util.mjs';
import { formatDuration } from './ui/duration.mjs';

/** Describe only facts supplied by the native runtime. This must never invent
 * the model's rationale or expose private reasoning_delta text. */
const safeLine = (value, limit = 160) =>
  bounded(redact(clean(String(value ?? '')).replace(/\s+/g, ' ').trim()), limit).split('\n')[0];

export function runtimeToolDescription(description) {
  return typeof description === 'string' && description.trim()
    ? safeLine(description, 200) : undefined;
}

export function toolResultLine(result) {
  if (!isRecord(result)) return 'Result received (expand for details)';
  const code = [result.exitCode, result.exit_code, result.code].find(
    value => Number.isSafeInteger(value) && value >= -32768 && value <= 32767);
  const codeText = code === undefined ? '' : `Exit ${code}`;
  // The upstream ZCode Bash display contract carries bounded output, but may
  // contain source secrets. Do not echo arbitrary output into a collapsed row.
  // Show only trusted-shape counts and explicit exit status by default.
  const output = isRecord(result.display) && result.display.kind === 'bash_output' &&
    typeof result.display.output === 'string' ? result.display.output :
    typeof result.stdout === 'string' ? result.stdout :
    typeof result.output === 'string' ? result.output : null;
  const size = output === null ? undefined : Buffer.byteLength(output, 'utf8');
  const truncated = isRecord(result.display) && result.display.kind === 'bash_output' &&
    result.display.truncated === true;
  const sizeText = Number.isSafeInteger(size)
    ? `${size} ${truncated ? 'visible output bytes (truncated)' : 'output bytes'}` : '';
  if (codeText && sizeText) return `${codeText} · ${sizeText} (expand to inspect)`;
  if (codeText) return codeText + ' (expand for details)';
  if (sizeText) return sizeText + ' (expand to inspect)';
  return 'Result received (expand for details)';
}

export function toolProgressLine(progress) {
  if (!isRecord(progress)) return undefined;
  const segments = [];
  if (typeof progress.elapsedMs === 'number' && Number.isFinite(progress.elapsedMs) &&
      progress.elapsedMs >= 0 && progress.elapsedMs < 30 * 24 * 3600 * 1000) {
    segments.push(`${Math.floor(progress.elapsedMs / 1000)}s elapsed`);
  }
  if (Number.isSafeInteger(progress.outputBytes) && progress.outputBytes >= 0) {
    segments.push(`${progress.outputBytes} output bytes`);
  } else if (Number.isSafeInteger(progress.stdoutBytes) && progress.stdoutBytes >= 0) {
    segments.push(`${progress.stdoutBytes} stdout bytes`);
  }
  if (Number.isSafeInteger(progress.stderrBytes) && progress.stderrBytes > 0)
    segments.push(`${progress.stderrBytes} stderr bytes`);
  return segments.length ? segments.join(' · ') : undefined;
}

export function toolTargetLabel(input) {
  if (!isRecord(input)) return '';
  const value = [input.command, input.file_path, input.filePath, input.path,
    input.pattern, input.query].find(x => typeof x === 'string' && x.trim());
  return value ? safeLine(value, 140) : '';
}

export function toolDisplaySummary(entry, now = Date.now()) {
  const description = runtimeToolDescription(entry.description);
  const result = typeof entry.resultSummary === 'string' ? safeLine(entry.resultSummary, 180) : undefined;
  const progress = typeof entry.progressSummary === 'string' ? safeLine(entry.progressSummary, 180) : undefined;
  const since = Number.isFinite(entry.startedAt) && entry.startedAt > 0 &&
    now >= entry.startedAt ? Math.floor((now - entry.startedAt) / 1000) : null;
  const alive = entry.status === 'running';
  const elapsed = alive && since !== null ? `Running ${formatDuration(since * 1000)}` : undefined;
  const line = alive ? [elapsed, progress].filter(Boolean).join(' · ') || 'Running'
    : entry.status === 'queued' ? 'Queued'
    : entry.status === 'done' ? result || 'Completed (expand for results)'
    : entry.status === 'error' ? 'Failed (expand for details)'
    : entry.status === 'cancelled' ? 'Cancelled' : result;
  return { description, detail: line };
}
