import { expect, test } from "vitest";
import { GET } from "@/app/get-started/route";

const req = (qs: string) => new Request(`https://www.measuremycostume.com/get-started${qs}`);

test("sets the checkout_intent cookie for a valid plan and redirects to sign-up", async () => {
  const res = await GET(req("?plan=unlimited"));
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("https://www.measuremycostume.com/sign-up");
  expect(res.cookies.get("checkout_intent")?.value).toBe("unlimited");
});

test("redirects without a cookie for a missing/invalid plan", async () => {
  const res = await GET(req("?plan=bogus"));
  expect(res.status).toBe(307);
  expect(res.cookies.get("checkout_intent")).toBeUndefined();
  const none = await GET(req(""));
  expect(none.cookies.get("checkout_intent")).toBeUndefined();
});
