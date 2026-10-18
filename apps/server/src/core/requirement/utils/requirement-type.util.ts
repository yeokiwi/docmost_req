/**
 * Requirement types: a named key pattern (prefix + number) with the
 * properties its requirements must or should have.
 */

export type RequirementTypeProperty = {
  name: string;
  required: boolean;
  // allowed values; empty means free text
  options?: string[];
};

export type RequirementTypeDef = {
  id?: string;
  name: string;
  keyPrefix: string;
  properties: RequirementTypeProperty[];
};

export type ValidationMessage = {
  level: 'error' | 'warning';
  code: 'missing' | 'not_allowed' | 'unmatched_key';
  property?: string;
  message: string;
};

export type ValidationStatus = 'valid' | 'warning' | 'error';

export type ValidationResult = {
  status: ValidationStatus | null;
  typeId: string | null;
  messages: ValidationMessage[];
};

/** "FN-012" -> { prefix: "FN-", number: 12 }; null when the key has no trailing number. */
export function splitKey(key: string): { prefix: string; number: number } | null {
  const m = /^(.*?)(\d+)$/.exec(key ?? '');
  if (!m || !m[1]) return null;
  return { prefix: m[1], number: parseInt(m[2], 10) };
}

/** The type whose prefix the key uses, preferring the longest prefix. */
export function matchType<T extends { keyPrefix: string }>(
  key: string,
  types: T[],
): T | null {
  const upper = (key ?? '').toUpperCase();
  let best: T | null = null;
  for (const type of types) {
    const prefix = type.keyPrefix.toUpperCase();
    if (!prefix || !upper.startsWith(prefix)) continue;
    if (!/^\d+$/.test(upper.slice(prefix.length))) continue;
    if (!best || prefix.length > best.keyPrefix.length) best = type;
  }
  return best;
}

export function formatTypeKey(prefix: string, seq: number, padding: number) {
  return `${prefix}${String(seq).padStart(padding, '0')}`;
}

/**
 * Checks a requirement against the type its key belongs to: missing required
 * properties are errors, missing optional ones warnings, and values outside
 * the allowed list errors. With locked keys, a key matching no type is an
 * error. `extraPrefixes` are always allowed (the space's default prefix).
 */
export function validateRequirement(
  requirement: { key: string; properties: Record<string, string> },
  types: RequirementTypeDef[],
  opts: { lockKeys?: boolean; extraPrefixes?: string[] } = {},
): ValidationResult {
  const type = matchType(requirement.key, types);
  const messages: ValidationMessage[] = [];

  if (!type) {
    const allowed = matchType(
      requirement.key,
      (opts.extraPrefixes ?? []).map((keyPrefix) => ({ keyPrefix })),
    );
    if (opts.lockKeys && !allowed) {
      messages.push({
        level: 'error',
        code: 'unmatched_key',
        message: 'The key does not match any requirement type of the space',
      });
      return { status: 'error', typeId: null, messages };
    }
    return { status: null, typeId: null, messages };
  }

  // property names compare without case or surrounding spaces
  const values = new Map<string, string>();
  for (const [name, value] of Object.entries(requirement.properties ?? {})) {
    values.set(name.trim().toLowerCase(), String(value ?? '').trim());
  }

  for (const prop of type.properties ?? []) {
    const value = values.get(prop.name.trim().toLowerCase()) ?? '';
    if (!value) {
      messages.push({
        level: prop.required ? 'error' : 'warning',
        code: 'missing',
        property: prop.name,
        message: prop.required
          ? `Missing required property "${prop.name}"`
          : `Missing optional property "${prop.name}"`,
      });
      continue;
    }
    const options = (prop.options ?? []).filter(Boolean);
    if (options.length && !options.some((o) => o.toLowerCase() === value.toLowerCase())) {
      messages.push({
        level: 'error',
        code: 'not_allowed',
        property: prop.name,
        message: `"${value}" is not an allowed value for "${prop.name}" (${options.join(', ')})`,
      });
    }
  }

  const status: ValidationStatus = messages.some((m) => m.level === 'error')
    ? 'error'
    : messages.length
      ? 'warning'
      : 'valid';
  return { status, typeId: type.id ?? null, messages };
}
