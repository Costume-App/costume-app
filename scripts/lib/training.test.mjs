import { describe, it, expect } from "vitest";
import { validateWalkthrough, mmss, rawDir, voDir } from "./training.mjs";
import { pageZoomInitScript } from "./record-core.mjs";

const ok = () => ({
  slug: "demo",
  title: "Demo",
  guideAnchor: "productions",
  sections: [
    { id: "a", heading: "A", targetSeconds: 10, run: async () => {} },
    { id: "b", heading: "B", targetSeconds: 5, prep: async () => {}, run: async () => {} },
  ],
});

describe("validateWalkthrough", () => {
  it("accepts a well-formed walkthrough", () => {
    expect(() => validateWalkthrough(ok(), "demo")).not.toThrow();
  });
  it("rejects a slug mismatch", () => {
    expect(() => validateWalkthrough(ok(), "other")).toThrow(/slug "other"/);
  });
  it("rejects a missing title", () => {
    const w = ok();
    delete w.title;
    expect(() => validateWalkthrough(w, "demo")).toThrow(/title/);
  });
  it("rejects duplicate section ids", () => {
    const w = ok();
    w.sections[1].id = "a";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/duplicate section id "a"/);
  });
  it("rejects a non-positive targetSeconds", () => {
    const w = ok();
    w.sections[0].targetSeconds = 0;
    expect(() => validateWalkthrough(w, "demo")).toThrow(/targetSeconds/);
  });
  it("rejects a prep that is not a function", () => {
    const w = ok();
    w.sections[1].prep = "nope";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/prep/);
  });
  it("rejects a section id that is not a safe dir name", () => {
    const w = ok();
    w.sections[0].id = "../x";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/id/);
  });
  it("rejects an unknown actor", () => {
    const w = ok();
    w.sections[0].actor = "admin";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/actor/);
  });
  it("rejects a receiver section without needsReceiver", () => {
    const w = ok();
    w.sections[0].actor = "receiver";
    expect(() => validateWalkthrough(w, "demo")).toThrow(/needsReceiver/);
  });
  it("accepts a receiver section when needsReceiver is true", () => {
    const w = ok();
    w.needsReceiver = true;
    w.sections[0].actor = "receiver";
    expect(() => validateWalkthrough(w, "demo")).not.toThrow();
  });
});

describe("pageZoomInitScript", () => {
  it("scopes the zoom apply to the given origin", () => {
    const script = pageZoomInitScript("http://localhost:3000");
    expect(script).toContain("location.origin");
    expect(script).toContain("http://localhost:3000");
  });
});

describe("mmss", () => {
  it("rounds the total before splitting", () => {
    expect(mmss(359.6)).toBe("6:00");
    expect(mmss(61.2)).toBe("1:01");
  });
});

describe("paths", () => {
  it("builds per-video dirs under recordings/training", () => {
    expect(rawDir("x")).toBe("recordings/training/raw/x");
    expect(voDir("x")).toBe("recordings/training/vo/x");
  });
});
