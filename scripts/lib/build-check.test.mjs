import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBuildId, buildManifestUrl, assertServerServingBuild } from "./build-check.mjs";

describe("readBuildId", () => {
  it("reads and trims the BUILD_ID file", () => {
    const d = mkdtempSync(join(tmpdir(), "build-"));
    writeFileSync(join(d, "BUILD_ID"), "abc123\n");
    expect(readBuildId(join(d, "BUILD_ID"))).toBe("abc123");
  });
  it("throws with a fix when missing", () => {
    expect(() => readBuildId(join(tmpdir(), "does-not-exist", "BUILD_ID"))).toThrow(/npm run build/);
  });
});

describe("buildManifestUrl", () => {
  it("points at this build's own static manifest", () => {
    expect(buildManifestUrl("http://localhost:6100", "abc123")).toBe(
      "http://localhost:6100/_next/static/abc123/_buildManifest.js"
    );
  });
});

describe("assertServerServingBuild", () => {
  it("passes on a 200", async () => {
    const fetchImpl = async () => ({ status: 200 });
    await expect(assertServerServingBuild("http://localhost:6100", "abc123", { fetchImpl })).resolves.toBeUndefined();
  });
  it("refuses on a non-200 (dev server or a different build)", async () => {
    const fetchImpl = async () => ({ status: 404 });
    await expect(assertServerServingBuild("http://localhost:6100", "abc123", { fetchImpl })).rejects.toThrow(
      /not serving this build/
    );
  });
  it("refuses when the server cannot be reached", async () => {
    const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
    await expect(assertServerServingBuild("http://localhost:6100", "abc123", { fetchImpl })).rejects.toThrow(
      /not serving this build/
    );
  });
});
