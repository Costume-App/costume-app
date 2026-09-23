import { describe, it, expect } from "vitest";
import { titleCardHtml } from "./title-card.mjs";

describe("titleCardHtml", () => {
  it("contains the title and subtitle, escaped", () => {
    const html = titleCardHtml({ title: "Roles & <Cast>", subtitle: "Measure My Costume training" });
    expect(html).toContain("Roles &amp; &lt;Cast&gt;");
    expect(html).toContain("Measure My Costume training");
    expect(html).not.toContain("<Cast>");
  });
  it("uses the app palette", () => {
    const html = titleCardHtml({ title: "T", subtitle: "S" });
    expect(html).toContain("#f4ecdd");
    expect(html).toContain("#c62828");
    expect(html).toContain("#241c19");
  });
});
