export interface DiffPart {
  text: string;
  kind: "same" | "added" | "removed";
}

/**
 * Word-level diff (LCS over whitespace-separated tokens) used for the
 * side-by-side and inline baseline comparison.
 */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = (before ?? "").split(/(\s+)/).filter(Boolean);
  const b = (after ?? "").split(/(\s+)/).filter(Boolean);
  const n = a.length;
  const m = b.length;
  if (n * m > 250_000) {
    return [
      { text: before, kind: "removed" },
      { text: after, kind: "added" },
    ];
  }
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  const push = (text: string, kind: DiffPart["kind"]) => {
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.text += text;
    else out.push({ text, kind });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i], "same");
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push(a[i++], "removed");
    } else {
      push(b[j++], "added");
    }
  }
  while (i < n) push(a[i++], "removed");
  while (j < m) push(b[j++], "added");
  return out;
}
