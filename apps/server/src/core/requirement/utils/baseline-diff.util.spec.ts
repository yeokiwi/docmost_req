import { BaselineSnapshotItem, diffBaselines } from './baseline-diff.util';

const item = (
  key: string,
  overrides: Partial<BaselineSnapshotItem> = {},
): BaselineSnapshotItem => ({
  key,
  title: `Title ${key}`,
  description: '',
  properties: {},
  pageId: 'p1',
  pageTitle: 'Page',
  dependsOnKeys: [],
  ...overrides,
});

describe('diffBaselines', () => {
  it('classifies added, removed, modified and unchanged', () => {
    const from = [item('SYS-001'), item('SYS-002'), item('SYS-003')];
    const to = [
      item('SYS-001'),
      item('SYS-002', { title: 'Renamed' }),
      item('SYS-010'),
    ];

    const diff = diffBaselines(from, to);

    expect(diff.added.map((i) => i.key)).toEqual(['SYS-010']);
    expect(diff.removed.map((i) => i.key)).toEqual(['SYS-003']);
    expect(diff.modified.map((m) => m.key)).toEqual(['SYS-002']);
    expect(diff.modified[0].changes).toEqual([
      { field: 'title', before: 'Title SYS-002', after: 'Renamed' },
    ]);
    expect(diff.unchangedCount).toBe(1);
  });

  it('reports property and dependency changes', () => {
    const diff = diffBaselines(
      [
        item('SYS-001', {
          properties: { Priority: 'High', Owner: 'A' },
          dependsOnKeys: ['SYS-002'],
        }),
      ],
      [
        item('SYS-001', {
          properties: { Priority: 'Low' },
          dependsOnKeys: ['SYS-003', 'SYS-002'],
        }),
      ],
    );

    expect(diff.modified[0].changes).toEqual([
      { field: 'property:Owner', before: 'A', after: null },
      { field: 'property:Priority', before: 'High', after: 'Low' },
      {
        field: 'dependsOn',
        before: 'SYS-002',
        after: 'SYS-002, SYS-003',
      },
    ]);
  });

  it('ignores dependency order', () => {
    const diff = diffBaselines(
      [item('SYS-001', { dependsOnKeys: ['B', 'A'] })],
      [item('SYS-001', { dependsOnKeys: ['A', 'B'] })],
    );
    expect(diff.modified).toEqual([]);
    expect(diff.unchangedCount).toBe(1);
  });

  it('sorts keys numerically', () => {
    const diff = diffBaselines(
      [],
      [item('SYS-010'), item('SYS-002'), item('SYS-001')],
    );
    expect(diff.added.map((i) => i.key)).toEqual([
      'SYS-001',
      'SYS-002',
      'SYS-010',
    ]);
  });
});
