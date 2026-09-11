/**
 * Parser for BraDypUS v4's "ShortSQL" mini-language, used verbatim by the
 * original PHP site in `finds-taxonomy.json` and embedded in article text via
 * `[[browseData]]...[[/browseData]]`.
 *
 * Grammar (from sites/default/modules/browseData/lib/bdus_api.php):
 *   @tb~?where~>sort~-limit~*group~]join
 * Only @tb, ?where and >sort are ever used by this site (verified against
 * every shortsql string in finds-taxonomy.json and all articles); group/join are
 * not implemented.
 *
 * where := token ('||' token)*
 * token := [connector '|'] ['(' '|'] fld '|' op '|' value [ '|' ')']
 * connector := 'and' | 'or'
 *
 * Deliberately a literal, mechanical translator (not a redesign): this is
 * what lets every query in the site keep behaving exactly as it did before,
 * translated field-for-field into the v5 Directus-style filter language.
 */

export type FilterCondition = Record<string, Record<string, string>>;
export type FilterGroup = { _and?: FilterNode[] } | { _or?: FilterNode[] };
export type FilterNode = FilterCondition | FilterGroup;

export interface ParsedShortSQL {
  tb: string;
  filter?: FilterNode;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

function opToDirectus(op: string, value: string): { op: string; value: string } {
  if (op === 'like') {
    // Original values are always wrapped in %...% (contains); strip the wildcards.
    return { op: '_icontains', value: value.replace(/^%/, '').replace(/%$/, '') };
  }
  if (op === '=') return { op: '_eq', value };
  throw new Error(`shortsql: unsupported operator "${op}"`);
}

interface RawToken {
  connector?: 'and' | 'or';
  open?: boolean;
  close?: boolean;
  fld: string;
  op: string;
  value: string;
}

function tokenizeWhere(where: string): RawToken[] {
  return where.split('||').map((raw) => {
    const parts = raw.split('|');
    let connector: 'and' | 'or' | undefined;
    if (parts[0] === 'and' || parts[0] === 'or') {
      connector = parts.shift() as 'and' | 'or';
    }
    let open = false;
    if (parts[0] === '(') {
      open = true;
      parts.shift();
    }
    const fld = parts.shift();
    const op = parts.shift();
    if (!fld || !op || parts.length === 0) {
      throw new Error(`shortsql: malformed where token "${raw}"`);
    }
    let close = false;
    if (parts[parts.length - 1] === ')') {
      close = true;
      parts.pop();
    }
    const value = parts.join('|');
    return { connector, open, close, fld, op, value };
  });
}

/** Groups a flat token list into nested and/or nodes. Handles at most one level of `(...)` — the only depth actually used by this site. */
function groupTokens(tokens: RawToken[]): FilterNode {
  const nodes: FilterNode[] = [];
  let topConnector: 'and' | 'or' | undefined;

  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (i > 0 && t.connector) {
      topConnector = topConnector ?? t.connector;
    }

    if (t.open) {
      const group: RawToken[] = [t];
      while (!group[group.length - 1].close) {
        i++;
        if (i >= tokens.length) throw new Error('shortsql: unbalanced ( )');
        group.push(tokens[i]);
      }
      const groupConnector = group[1]?.connector ?? 'and';
      const conditions = group.map(
        (g): FilterNode => ({ [g.fld]: (() => { const { op, value } = opToDirectus(g.op, g.value); return { [op]: value }; })() })
      );
      nodes.push(groupConnector === 'or' ? { _or: conditions } : { _and: conditions });
    } else {
      const { op, value } = opToDirectus(t.op, t.value);
      nodes.push({ [t.fld]: { [op]: value } });
    }
    i++;
  }

  if (nodes.length === 1) return nodes[0];
  return topConnector === 'or' ? { _or: nodes } : { _and: nodes };
}

export function parseShortSQL(shortsql: string): ParsedShortSQL {
  const clauses = shortsql.split('~');
  const tbClause = clauses.shift();
  if (!tbClause?.startsWith('@')) {
    throw new Error(`shortsql: missing table clause in "${shortsql}"`);
  }
  const result: ParsedShortSQL = { tb: tbClause.slice(1) };

  for (const clause of clauses) {
    const marker = clause[0];
    const body = clause.slice(1);
    if (marker === '?') {
      const tokens = tokenizeWhere(body);
      result.filter = groupTokens(tokens);
    } else if (marker === '>') {
      // Only single-field sort is used (a couple of queries request a
      // secondary sort key too; the caller re-sorts in JS for those since
      // the v5 list endpoint only accepts one sort field).
      const [field, dir] = body.split(',')[0].split(':');
      result.sortField = field;
      result.sortDir = dir === 'desc' ? 'desc' : 'asc';
    } else if (marker === '-') {
      const [limit, offset] = body.split(':');
      result.limit = Number(limit);
      result.offset = offset ? Number(offset) : 0;
    }
    // group (*) and join (]) clauses are not used anywhere in this site.
  }

  return result;
}

/** For queries with a secondary sort key (e.g. bibliography: author, then year) that v5's single sort_field can't express. */
export function secondarySortField(shortsql: string): string | undefined {
  const sortClause = shortsql.split('~').find((c) => c.startsWith('>'));
  const fields = sortClause?.slice(1).split(',');
  if (fields && fields.length > 1) {
    return fields[1].split(':')[0];
  }
  return undefined;
}
