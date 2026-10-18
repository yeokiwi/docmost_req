/**
 * Requirement search syntax (a subset of Requirement Yogi's):
 *
 *   key ~ 'BR-%' AND @Priority = 'High' AND PARENT@refines = 'REQ-001'
 *
 * Fields: key, title, text, page, @Property (escape spaces as "\ "),
 * TO / PARENT (requirements that reference the value),
 * FROM / CHILD (requirements referenced by the value), each optionally
 * narrowed to a relationship with "@name".
 * Operators: = (equals, case-insensitive), != , ~ (pattern, % is a wildcard), !~.
 * Clauses are combined with AND.
 */

export type QueryField =
  | { kind: 'key' }
  | { kind: 'title' }
  | { kind: 'text' }
  | { kind: 'page' }
  | { kind: 'property'; name: string }
  | { kind: 'to'; relation?: string }
  | { kind: 'from'; relation?: string };

export type QueryClause = {
  field: QueryField;
  op: '=' | '!=' | '~' | '!~';
  value: string;
};

export class QuerySyntaxError extends Error {
  constructor(
    message: string,
    public readonly position: number,
  ) {
    super(`${message} (at position ${position + 1})`);
  }
}

const DIRECTION_FIELDS: Record<string, 'to' | 'from'> = {
  to: 'to',
  parent: 'to',
  from: 'from',
  child: 'from',
};

export function parseRequirementQuery(input: string): QueryClause[] {
  const src = input ?? '';
  let i = 0;
  const clauses: QueryClause[] = [];

  const skipSpace = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };

  const readName = (): string => {
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === '\\' && i + 1 < src.length) {
        out += src[i + 1];
        i += 2;
        continue;
      }
      if (/[\s=!~'"]/.test(c)) break;
      out += c;
      i++;
    }
    return out;
  };

  const readField = (): QueryField => {
    const start = i;
    if (src[i] === '@') {
      i++;
      const name = readName();
      if (!name) throw new QuerySyntaxError('Expected a property name after @', start);
      return { kind: 'property', name };
    }
    const word = readName();
    if (!word) throw new QuerySyntaxError('Expected a field', start);
    const [base, relation] = word.split('@', 2);
    const lower = base.toLowerCase();
    if (DIRECTION_FIELDS[lower]) {
      return { kind: DIRECTION_FIELDS[lower], relation: relation || undefined };
    }
    if (relation !== undefined) {
      throw new QuerySyntaxError(`"${base}" does not take a relationship`, start);
    }
    if (lower === 'key' || lower === 'title' || lower === 'text' || lower === 'page') {
      return { kind: lower } as QueryField;
    }
    throw new QuerySyntaxError(
      `Unknown field "${word}". Use key, title, text, page, @Property, TO, PARENT, FROM or CHILD`,
      start,
    );
  };

  const readOp = (): QueryClause['op'] => {
    const start = i;
    for (const op of ['!=', '!~', '=', '~'] as const) {
      if (src.startsWith(op, i)) {
        i += op.length;
        return op;
      }
    }
    throw new QuerySyntaxError('Expected =, !=, ~ or !~', start);
  };

  const readValue = (): string => {
    const start = i;
    const quote = src[i];
    if (quote !== "'" && quote !== '"' && quote !== '‘' && quote !== '’') {
      throw new QuerySyntaxError("Expected a quoted value, e.g. 'REQ-001'", start);
    }
    const closing = quote === '‘' ? '’' : quote;
    i++;
    let out = '';
    while (i < src.length) {
      const c = src[i];
      if (c === closing || (closing === '’' && c === "'")) {
        // a doubled quote stands for the quote itself
        if (src[i + 1] === c) {
          out += c;
          i += 2;
          continue;
        }
        i++;
        return out;
      }
      out += c;
      i++;
    }
    throw new QuerySyntaxError('Missing closing quote', start);
  };

  skipSpace();
  if (i >= src.length) return [];
  for (;;) {
    skipSpace();
    const field = readField();
    skipSpace();
    const op = readOp();
    skipSpace();
    const value = readValue();
    clauses.push({ field, op, value });
    skipSpace();
    if (i >= src.length) break;
    const start = i;
    const word = readName();
    if (word.toLowerCase() !== 'and') {
      throw new QuerySyntaxError('Expected AND between conditions', start);
    }
  }
  return clauses;
}

/** 'BR-%' -> an ILIKE pattern where only % is a wildcard. */
export function toLikePattern(value: string): string {
  return value.replace(/[\\_]/g, '\\$&');
}
