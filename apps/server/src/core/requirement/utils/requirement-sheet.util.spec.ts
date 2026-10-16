import {
  buildExportTable,
  collectPropertyNames,
  parseRequirementKey,
  parseSheetTable,
} from './requirement-sheet.util';

describe('parseSheetTable', () => {
  it('maps known columns and treats the rest as properties', () => {
    const parsed = parseSheetTable([
      ['Key', 'Title', 'Description', 'Page', 'Priority', 'Depends on'],
      ['sys-001', 'Login', 'Users can log in', 'Auth', 'High', 'SYS-002'],
      ['', 'Logout', null, '', '', ''],
    ]);

    expect(parsed.propertyNames).toEqual(['Priority']);
    expect(parsed.rows).toEqual([
      {
        key: 'SYS-001',
        title: 'Login',
        description: 'Users can log in',
        properties: { Priority: 'High' },
      },
      { key: undefined, title: 'Logout', description: '', properties: {} },
    ]);
    expect(parsed.warnings).toEqual([]);
  });

  it('accepts header aliases and rich text cells', () => {
    const parsed = parseSheetTable([
      ['ID', 'Summary', 'Details'],
      ['A-1', { richText: [{ text: 'Rich ' }, { text: 'title' }] }, 42],
    ]);
    expect(parsed.rows[0]).toEqual({
      key: 'A-1',
      title: 'Rich title',
      description: '42',
      properties: {},
    });
  });

  it('requires a title column', () => {
    const parsed = parseSheetTable([['Key', 'Priority'], ['SYS-1', 'High']]);
    expect(parsed.rows).toEqual([]);
    expect(parsed.warnings).toEqual(['A "Title" column is required']);
  });

  it('skips rows without a title and blank rows', () => {
    const parsed = parseSheetTable([
      ['Title'],
      [''],
      ['Kept'],
      [null],
    ]);
    expect(parsed.rows.map((r) => r.title)).toEqual(['Kept']);
  });

  it('reports an empty file', () => {
    expect(parseSheetTable([]).warnings).toEqual(['The file is empty']);
  });
});

describe('buildExportTable', () => {
  it('builds a header and one row per requirement', () => {
    const items = [
      {
        key: 'SYS-001',
        title: 'Login',
        description: 'desc',
        properties: { Priority: 'High', Owner: 'Ann' },
        pageTitle: 'Auth',
        dependsOn: ['SYS-002', 'SYS-003'],
        referenceCount: 2,
      },
    ];
    const names = collectPropertyNames(items, ['Status', 'Priority']);
    expect(names).toEqual(['Status', 'Priority', 'Owner']);

    expect(buildExportTable(items, names)).toEqual([
      [
        'Key',
        'Title',
        'Description',
        'Page',
        'Status',
        'Priority',
        'Owner',
        'Depends on',
        'Reference count',
      ],
      [
        'SYS-001',
        'Login',
        'desc',
        'Auth',
        '',
        'High',
        'Ann',
        'SYS-002, SYS-003',
        '2',
      ],
    ]);
  });

  it('round-trips through parseSheetTable', () => {
    const table = buildExportTable(
      [
        {
          key: 'SYS-001',
          title: 'Login',
          description: 'desc',
          properties: { Priority: 'High' },
        },
      ],
      ['Priority'],
    );
    const parsed = parseSheetTable(table);
    expect(parsed.rows).toEqual([
      {
        key: 'SYS-001',
        title: 'Login',
        description: 'desc',
        properties: { Priority: 'High' },
      },
    ]);
  });
});

describe('parseRequirementKey', () => {
  it('parses valid keys', () => {
    expect(parseRequirementKey('SYS-012')).toEqual({ prefix: 'SYS', seq: 12 });
  });

  it('rejects invalid keys', () => {
    expect(parseRequirementKey('sys-1')).toBeNull();
    expect(parseRequirementKey('S-1')).toBeNull();
    expect(parseRequirementKey('SYS')).toBeNull();
  });
});
