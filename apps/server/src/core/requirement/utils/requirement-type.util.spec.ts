import {
  formatTypeKey,
  matchType,
  splitKey,
  validateRequirement,
} from './requirement-type.util';

const FN = {
  id: 'fn',
  name: 'Functional',
  keyPrefix: 'FN-',
  properties: [
    { name: 'Priority', required: true, options: ['High', 'Medium', 'Low'] },
    { name: 'Owner', required: false },
  ],
};
const FN_UI = { id: 'fnui', name: 'UI', keyPrefix: 'FN-UI-', properties: [] };

describe('splitKey / matchType', () => {
  it('splits prefix and number', () => {
    expect(splitKey('FN-012')).toEqual({ prefix: 'FN-', number: 12 });
    expect(splitKey('NOPE')).toBeNull();
  });

  it('prefers the longest matching prefix and needs a number after it', () => {
    expect(matchType('FN-UI-3', [FN, FN_UI])?.id).toBe('fnui');
    expect(matchType('FN-3', [FN, FN_UI])?.id).toBe('fn');
    expect(matchType('FN-X', [FN])).toBeNull();
    expect(matchType('fn-7', [FN])?.id).toBe('fn');
  });

  it('formats keys', () => {
    expect(formatTypeKey('FN-', 7, 3)).toBe('FN-007');
  });
});

describe('validateRequirement', () => {
  it('reports missing required as errors and optional as warnings', () => {
    const r = validateRequirement({ key: 'FN-1', properties: {} }, [FN]);
    expect(r.status).toBe('error');
    expect(r.messages.map((m) => [m.level, m.property])).toEqual([
      ['error', 'Priority'],
      ['warning', 'Owner'],
    ]);
  });

  it('is a warning when only optional properties are missing', () => {
    const r = validateRequirement({ key: 'FN-1', properties: { priority: 'high' } }, [FN]);
    expect(r.status).toBe('warning');
  });

  it('rejects values outside the allowed list', () => {
    const r = validateRequirement(
      { key: 'FN-1', properties: { Priority: 'Urgent', Owner: 'Ann' } },
      [FN],
    );
    expect(r.status).toBe('error');
    expect(r.messages[0].message).toContain('not an allowed value');
  });

  it('is valid when everything is present', () => {
    const r = validateRequirement(
      { key: 'FN-1', properties: { Priority: 'Low', Owner: 'Ann' } },
      [FN],
    );
    expect(r).toEqual({ status: 'valid', typeId: 'fn', messages: [] });
  });

  it('flags keys outside the types only when keys are locked', () => {
    expect(validateRequirement({ key: 'BR-1', properties: {} }, [FN]).status).toBeNull();
    expect(
      validateRequirement({ key: 'BR-1', properties: {} }, [FN], { lockKeys: true }).status,
    ).toBe('error');
    expect(
      validateRequirement({ key: 'REQ-1', properties: {} }, [FN], {
        lockKeys: true,
        extraPrefixes: ['REQ-'],
      }).status,
    ).toBeNull();
  });
});
