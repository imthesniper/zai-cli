import { clean, isRecord } from '../util.mjs';

// Wire fields checked against the pinned upstream protocol, not an assumed SDK.
export const NATIVE_PREFERENCES = Object.freeze({
  nativeSearchEnhancementsEnabled: false,
  subagentRuntimeConfigEnabled: false,
  memoryEnabled: false,
  askUserQuestionAutoResolutionEnabled: false,
  modelContextBudgetStrategy: 'preflight-v1',
});
export const NATIVE_ACCOUNT_AUTH_UNAVAILABLE = 'ZC does not implement the account-provider authentication bridge for app-server. An existing ZCode login alone does not supply this callback. No credentials were supplied. Use the official ZCode CLI while this integration is incomplete.';

function invalid(message) { return Object.assign(new Error(message), { code: -32602 }); }
export function runtimePreferences(params, sessionId) {
  if (!isRecord(params) || typeof params.sessionId !== 'string' || !params.sessionId.trim() ||
      !['runtime-materialization', 'user-execution'].includes(params.scope) ||
      Object.keys(params).some(key => !['sessionId', 'scope'].includes(key))) {
    throw invalid('Invalid runtime preference request.');
  }
  if (sessionId && params.sessionId !== sessionId) throw invalid('Runtime preferences requested for a different session.');
  // Settings only. This response neither authenticates a provider nor approves a tool.
  return { ...NATIVE_PREFERENCES };
}

export function parseNativeModel(value) {
  if (typeof value !== 'string' || value.length > 512) throw new Error('Native model selection requires providerId/modelId from /model.');
  const match = /^([A-Za-z0-9._:-]+)\/([A-Za-z0-9._:/-]+)(?:\$([A-Za-z0-9._-]+))?$/.exec(value);
  if (!match) throw new Error('Native model selection requires providerId/modelId, optionally followed by $reasoningLevel. Choose a runtime-provided option with /model.');
  return { providerId: match[1], modelId: match[2], ...(match[3] ? { options: { reasoningLevel: match[3] } } : {}) };
}
export function formatNativeModel(selection) {
  if (!isRecord(selection)) throw new Error('Invalid native model reference.');
  if (Object.keys(selection).some(key => !['providerId', 'modelId', 'options'].includes(key))) throw new Error('Unknown native model reference field.');
  const { providerId, modelId, options } = selection;
  if (typeof providerId !== 'string' || typeof modelId !== 'string' ||
      (options !== undefined && (!isRecord(options) || Object.keys(options).some(key => key !== 'reasoningLevel')))) {
    throw new Error('Invalid native model reference.');
  }
  const reasoning = options?.reasoningLevel;
  if (reasoning !== undefined && (typeof reasoning !== 'string' || !reasoning)) throw new Error('Invalid native reasoning level.');
  const value = `${providerId}/${modelId}${reasoning === undefined ? '' : '$' + reasoning}`;
  const parsed = parseNativeModel(value);
  // Formatting must not change field boundaries, for example a slash in providerId.
  if (parsed.providerId !== providerId || parsed.modelId !== modelId) throw new Error('Invalid native model reference.');
  return value;
}
/** Compare a runtime-confirmed model with an explicit selection.
 * A missing reasoning suffix means the operator chose the runtime default,
 * not that the runtime must leave options.reasoningLevel absent. */
export function matchesNativeModelSelection(actual, requested) {
  if (!actual) return false;
  const expected = typeof requested === 'string' ? parseNativeModel(requested) : requested;
  // Validate both shapes rather than trusting a projection with missing fields.
  formatNativeModel(actual);
  formatNativeModel(expected);
  return actual.providerId === expected.providerId &&
    actual.modelId === expected.modelId &&
    (expected.options?.reasoningLevel === undefined ||
      actual.options?.reasoningLevel === expected.options.reasoningLevel);
}

export function snapshotModel(snapshot) {
  const modelState = snapshot.settings?.model;
  const selection = isRecord(modelState) ? modelState.current : snapshot.session?.model;
  if (selection === undefined || selection === null) return undefined;
  formatNativeModel(selection);
  return selection;
}

/** Only expose exact references sent by the runtime. No first-model fallback. */
export function nativeModelCatalog(snapshot) {
  const available = snapshot.settings?.model?.available;
  if (available === undefined) return [];
  if (!Array.isArray(available) || available.length > 512) throw new Error('Invalid native model catalog.');
  const entries = new Map();
  for (const option of available) {
    if (!isRecord(option) || typeof option.label !== 'string') throw new Error('Invalid native model option.');
    const base = formatNativeModel(option.ref);
    if (option.disabledReason !== undefined && typeof option.disabledReason !== 'string') throw new Error('Invalid model availability reason.');
    const disabled = option.disabledReason !== undefined;
    const label = clean(option.label).replace(/\n/g, ' ').slice(0, 160);
    const provider = clean(option.providerLabel || option.ref.providerId).replace(/\n/g, ' ').slice(0, 160);
    const reason = disabled ? clean(option.disabledReason).replace(/\n/g, ' ').slice(0, 300) || 'Unavailable in this runtime.' : undefined;
    const add = (selection, suffix = '', displayValue, defaultUnavailable) => {
      const value = displayValue || formatNativeModel(selection);
      const blocked = disabled || Boolean(defaultUnavailable);
      const blockedReason = reason || defaultUnavailable;
      const candidate = { value, selection, label: `${label}${suffix}`,
        description: `${provider}${blocked ? ' | Unavailable: ' + blockedReason : ''}`,
        disabled: blocked, ...(blockedReason ? { disabledReason: blockedReason } : {}) };
      const previous = entries.get(value);
      // An unavailable or conflicting option cannot be made available by a duplicate.
      if (!previous || blocked) entries.set(value, candidate);
    };
    if (!option.reasoning || option.ref.options?.reasoningLevel) { add(parseNativeModel(base)); continue; }
    const levels = option.reasoning.levels;
    if (!Array.isArray(levels) || levels.length > 32) throw new Error('Invalid native reasoning options.');
    for (const level of levels) {
      if (!isRecord(level) || typeof level.value !== 'string' || typeof level.label !== 'string' ||
          !/^[A-Za-z0-9._-]+$/.test(level.value)) throw new Error('Invalid native reasoning option.');
    }
    if (!levels.length) add(parseNativeModel(base));
    else {
      const defaultLevel = option.reasoning.defaultLevel;
      const defaultAdvertised = typeof defaultLevel === 'string' && levels.some(level => level.value === defaultLevel);
      // The picker displays the bare reference, but the structured RPC must
      // include a concrete effort accepted by the upstream Registry validator.
      // Only the runtime-advertised default is eligible, never a guessed first.
      const selection = defaultAdvertised
        ? { ...parseNativeModel(base), options: { reasoningLevel: defaultLevel } }
        : parseNativeModel(base);
      add(selection, ' (Default reasoning)', base,
        defaultAdvertised ? undefined : 'Runtime did not advertise a valid default reasoning level; choose an explicit level.');
    }
    for (const level of levels) {
      add({ ...parseNativeModel(base), options: { reasoningLevel: level.value } },
        ` (${clean(level.label).replace(/\n/g, ' ').slice(0, 80)})`);
    }
    if (entries.size > 2048) throw new Error('Native model catalog exceeded its limit.');
  }
  return [...entries.values()];
}
