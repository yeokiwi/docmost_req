import { parseRequirementQuery, QuerySyntaxError, toLikePattern } from './requirement-query.parser';

describe('parseRequirementQuery', () => {
  it('parses fields, operators and AND', () => {
    expect(
      parseRequirementQuery("key ~ 'BR-%' AND @Priority = 'High' and text != 'draft'"),
    ).toEqual([
      { field: { kind: 'key' }, op: '~', value: 'BR-%' },
      { field: { kind: 'property', name: 'Priority' }, op: '=', value: 'High' },
      { field: { kind: 'text' }, op: '!=', value: 'draft' },
    ]);
  });

  it('understands directions and relationships', () => {
    expect(parseRequirementQuery("PARENT@refines = 'REQ-001'")[0].field).toEqual({
      kind: 'to',
      relation: 'refines',
    });
    expect(parseRequirementQuery("TO = 'REQ-001'")[0].field).toEqual({ kind: 'to', relation: undefined });
    expect(parseRequirementQuery("child ~ 'REQ-%'")[0].field.kind).toBe('from');
    expect(parseRequirementQuery("FROM = 'X'")[0].field.kind).toBe('from');
  });

  it('accepts escaped spaces in property names and doubled quotes', () => {
    const [c] = parseRequirementQuery("@Main\\ Category = 'Bob''s'");
    expect(c.field).toEqual({ kind: 'property', name: 'Main Category' });
    expect(c.value).toBe("Bob's");
  });

  it('accepts typographic quotes', () => {
    expect(parseRequirementQuery('PARENT = ‘REQ-001’')[0].value).toBe('REQ-001');
  });

  it('returns nothing for an empty query', () => {
    expect(parseRequirementQuery('  ')).toEqual([]);
  });

  it('reports errors with a position', () => {
    expect(() => parseRequirementQuery("colour = 'red'")).toThrow(QuerySyntaxError);
    expect(() => parseRequirementQuery("key = 'BR-1")).toThrow(/closing quote/);
    expect(() => parseRequirementQuery("key = 'a' OR key = 'b'")).toThrow(/AND/);
    expect(() => parseRequirementQuery('key BR-1')).toThrow(/Expected =/);
  });

  it('makes only % a wildcard', () => {
    expect(toLikePattern('A_B%')).toBe('A\\_B%');
  });
});
