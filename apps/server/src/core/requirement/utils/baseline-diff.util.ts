export type BaselineSnapshotItem = {
  key: string;
  title: string;
  description: string;
  properties: Record<string, string>;
  pageId: string | null;
  pageTitle: string | null;
  dependsOnKeys: string[];
};

export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export type BaselineDiff = {
  added: BaselineSnapshotItem[];
  removed: BaselineSnapshotItem[];
  modified: Array<{
    key: string;
    before: BaselineSnapshotItem;
    after: BaselineSnapshotItem;
    changes: FieldChange[];
  }>;
  unchangedCount: number;
};

function sortedKeys(keys: string[]): string {
  return [...new Set(keys)].sort().join(', ');
}

export function diffItems(
  before: BaselineSnapshotItem,
  after: BaselineSnapshotItem,
): FieldChange[] {
  const changes: FieldChange[] = [];

  if (before.title !== after.title) {
    changes.push({ field: 'title', before: before.title, after: after.title });
  }
  if (before.description !== after.description) {
    changes.push({
      field: 'description',
      before: before.description,
      after: after.description,
    });
  }
  if ((before.pageId ?? null) !== (after.pageId ?? null)) {
    changes.push({
      field: 'page',
      before: before.pageTitle ?? before.pageId,
      after: after.pageTitle ?? after.pageId,
    });
  }

  const propNames = new Set([
    ...Object.keys(before.properties ?? {}),
    ...Object.keys(after.properties ?? {}),
  ]);
  for (const name of [...propNames].sort()) {
    const b = before.properties?.[name] ?? null;
    const a = after.properties?.[name] ?? null;
    if (b !== a) {
      changes.push({ field: `property:${name}`, before: b, after: a });
    }
  }

  const depsBefore = sortedKeys(before.dependsOnKeys ?? []);
  const depsAfter = sortedKeys(after.dependsOnKeys ?? []);
  if (depsBefore !== depsAfter) {
    changes.push({
      field: 'dependsOn',
      before: depsBefore || null,
      after: depsAfter || null,
    });
  }

  return changes;
}

export function diffBaselines(
  from: BaselineSnapshotItem[],
  to: BaselineSnapshotItem[],
): BaselineDiff {
  const fromByKey = new Map(from.map((i) => [i.key, i]));
  const toByKey = new Map(to.map((i) => [i.key, i]));

  const result: BaselineDiff = {
    added: [],
    removed: [],
    modified: [],
    unchangedCount: 0,
  };

  for (const [key, after] of toByKey) {
    const before = fromByKey.get(key);
    if (!before) {
      result.added.push(after);
      continue;
    }
    const changes = diffItems(before, after);
    if (changes.length > 0) {
      result.modified.push({ key, before, after, changes });
    } else {
      result.unchangedCount++;
    }
  }

  for (const [key, before] of fromByKey) {
    if (!toByKey.has(key)) result.removed.push(before);
  }

  const byKey = (a: { key: string }, b: { key: string }) =>
    a.key.localeCompare(b.key, undefined, { numeric: true });
  result.added.sort(byKey);
  result.removed.sort(byKey);
  result.modified.sort(byKey);

  return result;
}
