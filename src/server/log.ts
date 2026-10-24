// Error logging without personal data or secrets. Drizzle errors carry the SQL *and its
// parameters* (emails, password hashes, session tokens) in `message`, `params` and `sql`, and
// mysql2 errors repeat the statement in `sql`. Log only the error kind, codes, a message with
// any query text or quoted database values removed, and the stack frames.

interface Described {
  name: string;
  message: string;
  code?: string;
  errno?: number;
  stack?: string[];
}

const QUERY_TEXT = /(Failed query:[\s\S]*|params:[\s\S]*)/;

function describe(error: unknown): Described {
  if (!(error instanceof Error)) return { name: typeof error, message: "non-Error thrown" };
  const { code, errno } = error as { code?: unknown; errno?: unknown };
  let message = error.message.replace(QUERY_TEXT, "[query omitted]");
  // Database messages quote the offending value ("Duplicate entry 'a@b.c' for key ...").
  if (typeof errno === "number") message = message.replace(/'[^']*'/g, "'…'");
  message = message.slice(0, 300);
  return {
    name: error.name,
    message,
    ...(typeof code === "string" ? { code } : {}),
    ...(typeof errno === "number" ? { errno } : {}),
    stack: error.stack
      ?.split("\n")
      .filter((line) => line.trimStart().startsWith("at "))
      .slice(0, 8)
      .map((line) => line.trim()),
  };
}

/** The error and its cause chain, safe to write to logs. */
export function safeError(error: unknown): Described[] {
  const chain: Described[] = [];
  let current: unknown = error;
  for (let depth = 0; current !== undefined && current !== null && depth < 5; depth++) {
    chain.push(describe(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

export function logError(context: string, error: unknown): void {
  console.error(context, JSON.stringify(safeError(error)));
}
