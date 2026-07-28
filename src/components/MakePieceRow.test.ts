import { expect, test, describe } from "vitest";
import { resolveLengthOverride, shouldOfferYardageUpdate } from "@/components/MakePieceRow";
import { estimateSkirtYardage } from "@/lib/fabric/skirt-yardage";

describe("resolveLengthOverride", () => {
  test("blank text is no override", () => {
    expect(resolveLengthOverride("", 32)).toBeNull();
    expect(resolveLengthOverride("   ", 32)).toBeNull();
  });

  test("0, negative, and non-numeric text are no override", () => {
    expect(resolveLengthOverride("0", 32)).toBeNull();
    expect(resolveLengthOverride("-5", 32)).toBeNull();
    expect(resolveLengthOverride("abc", 32)).toBeNull();
  });

  // The regression: the Length field is pre-filled from the outseam, and
  // `applyConstruction` saves the moment a skirt type is picked — well before
  // the designer has typed anything. A value that merely echoes the outseam
  // back must not count as a stored override, or the field would freeze at
  // that number forever and a later re-measurement would never take effect.
  test("a value that matches the current outseam is no override", () => {
    expect(resolveLengthOverride("32", 32)).toBeNull();
    expect(resolveLengthOverride("32.0", 32)).toBeNull();
  });

  test("a value that genuinely diverges from the outseam is a real override", () => {
    expect(resolveLengthOverride("28", 32)).toBe(28);
    expect(resolveLengthOverride("40", 32)).toBe(40);
  });

  test("any positive value is an override when there is no outseam to compare against", () => {
    expect(resolveLengthOverride("30", null)).toBe(30);
  });
});

describe("shouldOfferYardageUpdate", () => {
  test("never fires on a blank yardage field", () => {
    expect(shouldOfferYardageUpdate("", 5, 4.75)).toBe(false);
    expect(shouldOfferYardageUpdate("   ", 5, 4.75)).toBe(false);
  });

  test("never fires when nothing has been calculated yet", () => {
    expect(shouldOfferYardageUpdate("5", 5, null)).toBe(false);
  });

  test("does not fire when the field still matches the calculator and the estimate agrees", () => {
    expect(shouldOfferYardageUpdate("4.75", 4.75, 4.75)).toBe(false);
  });

  // The residual bug: someone intentionally types 5 against a 4.75 estimate.
  // That is a deliberate override, not evidence that measurements changed, so
  // the nudge must not fire (and must not fire "permanently" on every render).
  test("does not fire on a deliberate manual override", () => {
    expect(shouldOfferYardageUpdate("5", 4.75, 4.75)).toBe(false);
  });

  // Genuine staleness: the field still holds the calculator's last output,
  // but the live estimate has since moved (e.g. a re-measurement).
  test("fires when the field still holds the calculator's last output and the estimate has diverged", () => {
    expect(shouldOfferYardageUpdate("4.75", 5.5, 4.75)).toBe(true);
  });

  test("does not fire on non-numeric yardage text", () => {
    expect(shouldOfferYardageUpdate("abc", 5, 4.75)).toBe(false);
  });

  test("no update is offered when the yardage never came from the calculator", () => {
    // A hand-typed or AI-written value has no calculated_yardage, so there is no
    // claim that measurements moved — prompting here would offer to overwrite the
    // user's own number with the calculator's minimum.
    expect(shouldOfferYardageUpdate("5.5", 4.75, null)).toBe(false);
  });

  test("no update is offered when the field holds a deliberate override", () => {
    expect(shouldOfferYardageUpdate("5.5", 5.25, 4.75)).toBe(false);
  });

  test("an update is offered when the field still holds the calculator's own number", () => {
    expect(shouldOfferYardageUpdate("4.75", 5.25, 4.75)).toBe(true);
  });

  test("no update is offered when the estimate has not moved", () => {
    expect(shouldOfferYardageUpdate("4.75", 4.75, 4.75)).toBe(false);
  });
});

// End-to-end regression check: with no stored length, a change in the
// performer's outseam must change the computed yardage. Before the fix,
// `skirt_length_in` was persisted on every save (including the save that
// fires the instant a skirt type is picked), so it was almost never null —
// the length field would initialize from the stale stored number instead of
// the performer's current outseam, and a re-measurement would silently never
// reach the estimate.
describe("outseam changes reach the estimate when no length override is stored", () => {
  test("piece saved at outseam 32, then the performer is re-measured to 36", () => {
    const construction = "full_circle" as const;
    const waistIn = 27;
    const fabricWidthIn = 45;

    // First save: no stored length yet, so the field is pre-filled from the
    // outseam (32) and the designer hasn't typed anything over it.
    const firstLengthField = String(32);
    const firstOutseamIn = 32;
    const firstOverride = resolveLengthOverride(firstLengthField, firstOutseamIn);
    // The regression: this must be null (not persisted as an override) —
    // otherwise the fallback below never fires again.
    expect(firstOverride).toBeNull();
    const firstEffectiveLength = firstOverride ?? firstOutseamIn;
    const firstEstimate = estimateSkirtYardage({
      construction,
      waistInches: waistIn,
      lengthInches: firstEffectiveLength,
      fabricWidthInches: fabricWidthIn,
    });
    expect(firstEstimate.yards).toBe(4.75); // the pinned anchor

    // Reload: `skirt_length_in` came back null (per the fix above), so the
    // Length field re-initializes from the performer's *new* outseam, 36 —
    // never from the stale 32.
    const secondOutseamIn = 36;
    const secondLengthField = String(secondOutseamIn);
    const secondOverride = resolveLengthOverride(secondLengthField, secondOutseamIn);
    expect(secondOverride).toBeNull();
    const secondEffectiveLength = secondOverride ?? secondOutseamIn;
    expect(secondEffectiveLength).toBe(36);

    const secondEstimate = estimateSkirtYardage({
      construction,
      waistInches: waistIn,
      lengthInches: secondEffectiveLength,
      fabricWidthInches: fabricWidthIn,
    });

    // The whole point: the re-measurement must actually move the computed
    // yardage, not silently match the stale 4.75.
    expect(secondEstimate.yards).not.toBe(firstEstimate.yards);
    expect(secondEstimate.yards).toBeGreaterThan(firstEstimate.yards);
  });

  test("a deliberate length override is still persisted and still used", () => {
    // The designer types a genuinely different length (a knee-length skirt),
    // which must survive being saved and must still drive the estimate —
    // only the "matches the outseam" case is suppressed.
    const override = resolveLengthOverride("20", 32);
    expect(override).toBe(20);

    const r = estimateSkirtYardage({
      construction: "full_circle",
      waistInches: 27,
      lengthInches: override ?? 32,
      fabricWidthInches: 45,
    });
    expect(r.yards).not.toBe(4.75);
  });
});
