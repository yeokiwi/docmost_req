import {
  collectRequirementsFromPmJson,
  formatRequirementKey,
  hasRequirementNodes,
  pmNodesToText,
} from './requirement-prosemirror.util';

const p = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const ref = (key: string, id?: string, spaceId?: string) => ({
  type: 'requirementRef',
  attrs: { id: id ?? null, key, spaceId: spaceId ?? null },
});

const req = (
  key: string,
  id: string | null,
  content: any[],
  extra: Record<string, any> = {},
) => ({
  type: 'requirement',
  attrs: { id, key, title: `Title ${key}`, properties: {}, ...extra },
  content,
});

describe('hasRequirementNodes', () => {
  it('detects nested requirement nodes', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [req('SYS-001', 'a', [])] }],
    };
    expect(hasRequirementNodes(doc)).toBe(true);
  });

  it('detects refs', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [ref('SYS-001', 'r')] }],
    };
    expect(hasRequirementNodes(doc)).toBe(true);
  });

  it('returns false for plain docs and junk', () => {
    expect(hasRequirementNodes({ type: 'doc', content: [p('hi')] })).toBe(
      false,
    );
    expect(hasRequirementNodes(null)).toBe(false);
    expect(hasRequirementNodes('x')).toBe(false);
  });
});

describe('collectRequirementsFromPmJson', () => {
  it('collects requirements with description text and properties', () => {
    const doc = {
      type: 'doc',
      content: [
        req('sys-001', 'n1', [p('First line'), p('Second line')], {
          properties: { Priority: ' High ', Empty: '', ' ': 'x' },
        }),
      ],
    };
    const { requirements, refs } = collectRequirementsFromPmJson(doc);
    expect(refs).toEqual([]);
    expect(requirements).toEqual([
      {
        nodeId: 'n1',
        key: 'SYS-001',
        title: 'Title sys-001',
        description: 'First line\nSecond line',
        properties: { Priority: 'High' },
      },
    ]);
  });

  it('attributes refs inside a requirement to that requirement', () => {
    const doc = {
      type: 'doc',
      content: [
        req('SYS-002', 'n2', [
          { type: 'paragraph', content: [ref('SYS-001', 'r1')] },
        ]),
        { type: 'paragraph', content: [ref('SYS-002', 'r2', 'space-b')] },
      ],
    };
    const { refs } = collectRequirementsFromPmJson(doc);
    expect(refs).toEqual([
      {
        nodeId: 'r1',
        key: 'SYS-001',
        spaceId: null,
        sourceKey: 'SYS-002',
        relation: null,
      },
      {
        nodeId: 'r2',
        key: 'SYS-002',
        spaceId: 'space-b',
        sourceKey: null,
        relation: null,
      },
    ]);
  });

  it('ignores a requirement referencing itself', () => {
    const doc = {
      type: 'doc',
      content: [
        req('SYS-003', 'n3', [
          { type: 'paragraph', content: [ref('SYS-003', 'r3')] },
        ]),
      ],
    };
    expect(collectRequirementsFromPmJson(doc).refs).toEqual([]);
  });

  it('falls back to key-based node ids and dedupes repeated node ids', () => {
    const doc = {
      type: 'doc',
      content: [
        req('SYS-004', null, [p('a')]),
        req('SYS-005', 'dup', [p('b')]),
        req('SYS-006', 'dup', [p('c')]),
      ],
    };
    const { requirements } = collectRequirementsFromPmJson(doc);
    expect(requirements.map((r) => [r.nodeId, r.key])).toEqual([
      ['key:SYS-004', 'SYS-004'],
      ['dup', 'SYS-005'],
    ]);
  });

  it('keeps duplicate keys on different nodes so the index can flag them', () => {
    const doc = {
      type: 'doc',
      content: [req('SYS-007', 'a', [p('x')]), req('SYS-007', 'b', [p('y')])],
    };
    const { requirements } = collectRequirementsFromPmJson(doc);
    expect(requirements.map((r) => r.nodeId)).toEqual(['a', 'b']);
  });

  it('skips requirements and refs without a key', () => {
    const doc = {
      type: 'doc',
      content: [
        req('', 'a', [{ type: 'paragraph', content: [ref('SYS-001', 'r')] }]),
        { type: 'paragraph', content: [ref('', 'r0')] },
      ],
    };
    const { requirements, refs } = collectRequirementsFromPmJson(doc);
    expect(requirements).toEqual([]);
    expect(refs).toEqual([
      {
        nodeId: 'r',
        key: 'SYS-001',
        spaceId: null,
        sourceKey: null,
        relation: null,
      },
    ]);
  });
});

describe('requirement links in tables', () => {
  const cell = (type: string, content: any[], attrs: any = {}) => ({
    type,
    attrs,
    content,
  });
  const row = (...cells: any[]) => ({ type: 'tableRow', content: cells });
  const table = (...rows: any[]) => ({ type: 'table', content: rows });

  it('names a link after its column and attributes it to the row requirement', () => {
    const doc = {
      type: 'doc',
      content: [
        table(
          row(
            cell('tableHeader', [p('Requirement')]),
            cell('tableHeader', [p('Description')]),
            cell('tableHeader', [p('Relates')]),
          ),
          row(
            cell('tableCell', [req('FN-01', 'a', [p('')])]),
            cell('tableCell', [p('Does things')]),
            cell('tableCell', [
              { type: 'paragraph', content: [ref('BR-01', 'r1')] },
            ]),
          ),
        ),
      ],
    };
    const { refs } = collectRequirementsFromPmJson(doc);
    expect(refs).toEqual([
      expect.objectContaining({
        key: 'BR-01',
        sourceKey: 'FN-01',
        relation: 'Relates',
      }),
    ]);
  });

  it('treats a first row that defines requirements as data, not titles', () => {
    const doc = {
      type: 'doc',
      content: [
        table(
          row(
            cell('tableCell', [req('FN-01', 'a', [p('')])]),
            cell('tableCell', [{ type: 'paragraph', content: [ref('BR-01', 'r1')] }]),
          ),
        ),
      ],
    };
    const { refs } = collectRequirementsFromPmJson(doc);
    expect(refs[0]).toMatchObject({ sourceKey: 'FN-01', relation: null });
  });

  it('keeps refs outside requirements and tables unnamed', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [ref('BR-01', 'r1')] }],
    };
    const { refs } = collectRequirementsFromPmJson(doc);
    expect(refs[0]).toMatchObject({ sourceKey: null, relation: null });
  });
});

describe('pmNodesToText', () => {
  it('renders inline atoms and separates blocks', () => {
    const text = pmNodesToText([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'See ' },
          ref('SYS-001'),
          { type: 'hardBreak' },
          { type: 'mention', attrs: { label: 'Alice' } },
        ],
      },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p('item')] }],
      },
    ]);
    expect(text).toBe('See SYS-001\n@Alice\nitem');
  });
});

describe('formatRequirementKey', () => {
  it('zero pads the sequence', () => {
    expect(formatRequirementKey('SYS', 7, 3)).toBe('SYS-007');
    expect(formatRequirementKey('SYS', 1234, 3)).toBe('SYS-1234');
  });
});
