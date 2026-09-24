// Proves the server behind a BASE url is actually serving THIS repo's local
// production build, not `next dev` and not a stale `next start`. There is no
// reliable way to ask a running server "were you started with next start",
// so this instead asks it for an asset that only the build with this exact
// BUILD_ID can serve: `.next/static/<BUILD_ID>/_buildManifest.js`. A dev
// server never has that path (dev assets live under a different layout), and
// a `next start` running a DIFFERENT build answers with a 404 for this id.
// Confirmed against this repo's own `.next/static/<BUILD_ID>/` listing,
// which contains `_buildManifest.js`, `_clientMiddlewareManifest.js` and
// `_ssgManifest.js`.
import { existsSync, readFileSync } from "node:fs";

export function readBuildId(buildIdPath = ".next/BUILD_ID") {
  if (!existsSync(buildIdPath)) {
    throw new Error(`${buildIdPath} missing. Run: npm run build`);
  }
  return readFileSync(buildIdPath, "utf8").trim();
}

export function buildManifestUrl(base, buildId) {
  return `${base}/_next/static/${buildId}/_buildManifest.js`;
}

/** `fetchImpl` and `timeoutMs` are injectable so this stays unit-testable
 * without a real server. */
export async function assertServerServingBuild(base, buildId, { fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const url = buildManifestUrl(base, buildId);
  let res;
  try {
    res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    throw new Error(
      `Server at ${base} is not serving this build (${buildId}): could not reach ${url} (${err.message}). ` +
      `Likely next dev or a stale start.`
    );
  }
  if (res.status !== 200) {
    throw new Error(
      `Server at ${base} is not serving this build (${buildId}): GET ${url} -> ${res.status}. ` +
      `Likely next dev or a stale start.`
    );
  }
}
