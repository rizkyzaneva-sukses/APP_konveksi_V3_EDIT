// =============================================================================
// src/lib/supabase/server.ts
// Compatibility layer — menggantikan Supabase client dengan query langsung ke PostgreSQL.
// API dibuat mirip Supabase agar tidak perlu rewrite semua action files.
// =============================================================================

import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
});

type FilterOp = { column: string; value: unknown };
type OrderOp = { column: string; ascending: boolean };

interface QueryBuilder<T = Record<string, unknown>> {
  select(columns?: string): QueryBuilder<T>;
  insert(data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
  update(data: Record<string, unknown>): QueryBuilder<T>;
  delete(): QueryBuilder<T>;
  eq(column: string, value: unknown): QueryBuilder<T>;
  neq(column: string, value: unknown): QueryBuilder<T>;
  not(column: string, operator: string, value: unknown): QueryBuilder<T>;
  gt(column: string, value: unknown): QueryBuilder<T>;
  gte(column: string, value: unknown): QueryBuilder<T>;
  lt(column: string, value: unknown): QueryBuilder<T>;
  lte(column: string, value: unknown): QueryBuilder<T>;
  in(column: string, values: unknown[]): QueryBuilder<T>;
  is(column: string, value: unknown): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  contains(column: string, value: unknown): QueryBuilder<T>;
  match(criteria: Record<string, unknown>): QueryBuilder<T>;
  upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  range(from: number, to: number): QueryBuilder<T>;
  single(): Promise<{ data: T | null; error: Error | null }>;
  maybeSingle(): Promise<{ data: T | null; error: Error | null }>;
  then(resolve: (result: { data: T[] | null; error: Error | null; count?: number }) => void): void;
}

// Strip Supabase join syntax from select string, keeping only plain columns
function stripJoinSyntax(columns: string): string {
  if (!columns || columns === '*') return '*';
  const result: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < columns.length; i++) {
    const char = columns[i];
    if (char === '(') { depth++; current += char; }
    else if (char === ')') { depth--; current += char; }
    else if (char === ',' && depth === 0) {
      const col = current.trim();
      if (col && !col.includes(':') && !col.includes('(')) result.push(col);
      current = '';
    } else if (depth === 0) { current += char; }
  }
  const last = current.trim();
  if (last && !last.includes(':') && !last.includes('(')) result.push(last);
  return result.length > 0 ? result.join(', ') : '*';
}

function buildQuery(table: string) {
  let operation: 'select' | 'insert' | 'update' | 'delete' = 'select';
  let selectColumns = '*';
  let insertData: Record<string, unknown> | Record<string, unknown>[] | null = null;
  let updateData: Record<string, unknown> | null = null;
  let filters: string[] = [];
  let filterValues: unknown[] = [];
  let orders: OrderOp[] = [];
  let limitCount: number | null = null;
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  let returnSelect = false;
  let paramIndex = 1;

  function addParam(value: unknown): string {
    filterValues.push(value);
    return `$${paramIndex++}`;
  }

  const builder: any = {
    select(columns?: string) {
      if (operation === 'insert' || operation === 'update') {
        returnSelect = true;
        if (columns) selectColumns = stripJoinSyntax(columns);
        return builder;
      }
      operation = 'select';
      if (columns) selectColumns = stripJoinSyntax(columns);
      return builder;
    },
    insert(data: Record<string, unknown> | Record<string, unknown>[]) {
      operation = 'insert';
      insertData = data;
      return builder;
    },
    update(data: Record<string, unknown>) {
      operation = 'update';
      updateData = data;
      return builder;
    },
    delete() {
      operation = 'delete';
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push(`"${column}" = ${addParam(value)}`);
      return builder;
    },
    neq(column: string, value: unknown) {
      filters.push(`"${column}" != ${addParam(value)}`);
      return builder;
    },
    gt(column: string, value: unknown) {
      filters.push(`"${column}" > ${addParam(value)}`);
      return builder;
    },
    gte(column: string, value: unknown) {
      filters.push(`"${column}" >= ${addParam(value)}`);
      return builder;
    },
    lt(column: string, value: unknown) {
      filters.push(`"${column}" < ${addParam(value)}`);
      return builder;
    },
    lte(column: string, value: unknown) {
      filters.push(`"${column}" <= ${addParam(value)}`);
      return builder;
    },
    in(column: string, values: unknown[]) {
      if (values.length === 0) {
        filters.push('FALSE');
      } else {
        const placeholders = values.map(v => addParam(v)).join(', ');
        filters.push(`"${column}" IN (${placeholders})`);
      }
      return builder;
    },
    is(column: string, value: unknown) {
      if (value === null) {
        filters.push(`"${column}" IS NULL`);
      } else {
        filters.push(`"${column}" IS ${value}`);
      }
      return builder;
    },
    like(column: string, pattern: string) {
      filters.push(`"${column}" LIKE ${addParam(pattern)}`);
      return builder;
    },
    ilike(column: string, pattern: string) {
      filters.push(`"${column}" ILIKE ${addParam(pattern)}`);
      return builder;
    },
    contains(column: string, value: unknown) {
      filters.push(`"${column}" @> ${addParam(JSON.stringify(value))}::jsonb`);
      return builder;
    },
    or(filter: string) {
      // Parse Supabase .or() filter string, e.g. 'status.eq.active,status.eq.draft'
      // For complex filters, fall back to a raw OR condition
      const parts = filter.split(',').map((part: string) => part.trim());
      const orClauses: string[] = [];
      for (const part of parts) {
        // Simple patterns: col.eq.val, col.in.(a,b,c), col.is.null
        const eqMatch = part.match(/^(\w+)\.eq\.(.+)$/);
        const isMatch = part.match(/^(\w+)\.is\.null$/);
        const inMatch = part.match(/^(\w+)\.in\.\((.+)\)$/);
        if (eqMatch) {
          orClauses.push(`"${eqMatch[1]}" = ${addParam(eqMatch[2])}`);
        } else if (isMatch) {
          orClauses.push(`"${isMatch[1]}" IS NULL`);
        } else if (inMatch) {
          const vals = inMatch[2].split(',').map((v: string) => addParam(v.trim()));
          orClauses.push(`"${inMatch[1]}" IN (${vals.join(', ')})`);
        }
        // Complex nested patterns (and(...)) are skipped — will be ignored
      }
      if (orClauses.length > 0) {
        filters.push(`(${orClauses.join(' OR ')})`);
      }
      return builder;
    },
    not(column: string, operator: string, value: unknown) {
      // Supports: .not('column', 'is', null) → column IS NOT NULL
      //           .not('column', 'eq', val)  → column != val
      //           .not('column', 'cs', jsonStr) → NOT column @> val::jsonb
      if (operator === 'is' && value === null) {
        filters.push(`"${column}" IS NOT NULL`);
      } else if (operator === 'eq') {
        filters.push(`"${column}" != ${addParam(value)}`);
      } else if (operator === 'in' && Array.isArray(value)) {
        if (value.length === 0) {
          filters.push('TRUE');
        } else {
          const placeholders = value.map((v: unknown) => addParam(v)).join(', ');
          filters.push(`"${column}" NOT IN (${placeholders})`);
        }
      } else if (operator === 'cs') {
        filters.push(`NOT ("${column}" @> ${addParam(value)}::jsonb)`);
      } else {
        // Fallback: skip unknown operator to avoid SQL syntax error
      }
      return builder;
    },
    match(criteria: Record<string, unknown>) {
      Object.entries(criteria).forEach(([col, val]) => {
        filters.push(`"${col}" = ${addParam(val)}`);
      });
      return builder;
    },
    upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
      operation = 'insert';
      insertData = data;
      // Build ON CONFLICT clause
      const conflictCols = options?.onConflict
        ? options.onConflict.split(',').map(c => `"${c.trim()}"`).join(', ')
        : null;
      // Store conflict info for use in execute()
      (builder as any).__upsertConflict = conflictCols;
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      orders.push({ column, ascending: options?.ascending ?? true });
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    range(from: number, to: number) {
      rangeFrom = from;
      rangeTo = to;
      return builder;
    },
    async single(): Promise<{ data: any; error: Error | null }> {
      try {
        const result = await execute();
        if (result.length === 0) {
          return { data: null, error: new Error('No rows found') };
        }
        return { data: result[0], error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    async maybeSingle(): Promise<{ data: any; error: Error | null }> {
      try {
        const result = await execute();
        return { data: result[0] || null, error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    then(resolve: any, reject?: any) {
      execute()
        .then(result => resolve({ data: result, error: null, count: result.length }))
        .catch(e => {
          if (reject) reject(e);
          else resolve({ data: null, error: e });
        });
    },
  };

  async function execute(): Promise<any[]> {
    let query = '';

    if (operation === 'select') {
      query = `SELECT ${selectColumns === '*' ? '*' : selectColumns.split(',').map(c => `"${c.trim()}"`).join(', ')} FROM "${table}"`;
    } else if (operation === 'insert' && insertData) {
      const rows = Array.isArray(insertData) ? insertData : [insertData];
      const columns = Object.keys(rows[0]);
      const colStr = columns.map(c => `"${c}"`).join(', ');
      const valStr = rows.map(row => {
        return '(' + columns.map(c => addParam(row[c])).join(', ') + ')';
      }).join(', ');
      query = `INSERT INTO "${table}" (${colStr}) VALUES ${valStr}`;
      // Handle upsert (ON CONFLICT DO UPDATE)
      const upsertConflict = (builder as any).__upsertConflict;
      if (upsertConflict) {
        const updateClauses = columns
          .filter(c => !upsertConflict.includes(`"${c}"`))
          .map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
        if (updateClauses) {
          query += ` ON CONFLICT (${upsertConflict}) DO UPDATE SET ${updateClauses}`;
        } else {
          query += ` ON CONFLICT (${upsertConflict}) DO NOTHING`;
        }
      }
      if (returnSelect) {
        query += ` RETURNING ${selectColumns === '*' ? '*' : selectColumns.split(',').map(c => `"${c.trim()}"`).join(', ')}`;
      }
    } else if (operation === 'update' && updateData) {
      const setClauses = Object.entries(updateData).map(([k, v]) => `"${k}" = ${addParam(v)}`);
      query = `UPDATE "${table}" SET ${setClauses.join(', ')}`;
      if (returnSelect) {
        query += ` RETURNING ${selectColumns === '*' ? '*' : selectColumns.split(',').map(c => `"${c.trim()}"`).join(', ')}`;
      }
    } else if (operation === 'delete') {
      query = `DELETE FROM "${table}"`;
      if (returnSelect) {
        query += ` RETURNING ${selectColumns === '*' ? '*' : selectColumns.split(',').map(c => `"${c.trim()}"`).join(', ')}`;
      }
    }

    if (filters.length > 0 && operation !== 'insert') {
      query += ` WHERE ${filters.join(' AND ')}`;
    }

    if (orders.length > 0) {
      query += ` ORDER BY ${orders.map(o => `"${o.column}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')}`;
    }

    if (limitCount !== null) {
      query += ` LIMIT ${limitCount}`;
    }

    if (rangeFrom !== null && rangeTo !== null) {
      query += ` LIMIT ${rangeTo - rangeFrom + 1} OFFSET ${rangeFrom}`;
    }

    const result = await sql.unsafe(query, filterValues as any);
    return result as any[];
  }

  return builder as QueryBuilder;
}

interface SupabaseCompatClient {
  from(table: string): QueryBuilder;
  rpc(fn: string, params?: Record<string, unknown>): Promise<{ data: any; error: Error | null }>;
  auth: {
    getUser(): Promise<{ data: { user: null }; error: null }>;
  };
}

export async function createClient(): Promise<SupabaseCompatClient> {
  return {
    from(table: string) {
      return buildQuery(table);
    },
    async rpc(fn: string, params?: Record<string, unknown>): Promise<{ data: any; error: Error | null }> {
      try {
        // Build a SELECT query to call a PostgreSQL function
        let query: string;
        const paramValues: unknown[] = [];
        let paramIdx = 1;

        if (params && Object.keys(params).length > 0) {
          const paramStr = Object.entries(params)
            .map(([key, val]) => {
              paramValues.push(val);
              return `${key} => $${paramIdx++}`;
            })
            .join(', ');
          query = `SELECT * FROM ${fn}(${paramStr})`;
        } else {
          query = `SELECT * FROM ${fn}()`;
        }

        const result = await sql.unsafe(query, paramValues as any);
        const rows = result as any[];
        // If single row with single column, return the value directly
        if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
          return { data: Object.values(rows[0])[0], error: null };
        }
        return { data: rows.length === 1 ? rows[0] : rows, error: null };
      } catch (e: any) {
        return { data: null, error: e };
      }
    },
    auth: {
      // Auth tidak lagi dihandle via Supabase — return null.
      // Gunakan getSession() dari @/lib/auth/session untuk auth.
      async getUser() {
        return { data: { user: null }, error: null };
      },
    },
  };
}
