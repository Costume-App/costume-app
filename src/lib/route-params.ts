import { notFound } from "next/navigation";
import { NotFoundError } from "@/lib/errors";

// Every table id is a uuid. A malformed id in a URL would otherwise reach Postgres,
// fail with 22P02, and surface as a 500; reject it here as not found instead.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Route handlers: resolves dynamic params, throwing NotFoundError (404) on a malformed id.
export async function idParams<T extends Record<string, string>>(params: Promise<T>): Promise<T> {
  const resolved = await params;
  for (const value of Object.values(resolved)) {
    if (!isUuid(value)) throw new NotFoundError("Not found");
  }
  return resolved;
}

// Pages: same check, rendering the 404 page instead of throwing.
export async function pageIdParams<T extends Record<string, string>>(params: Promise<T>): Promise<T> {
  try {
    return await idParams(params);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
}
