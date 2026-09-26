// The synthetic measurement form's values, as data. Shared by the generator
// (scripts/make-demo-measurement-form.mjs, which prints these onto the form
// image) and by video 3's walkthrough (Task 4), so the narration and the
// image can never drift apart.
//
// Every `key` here is a real measurement_definitions key: the numeric ones
// come from MEASUREMENT_UNITS, the three size fields are the app's known
// text keys. Every `label` is copied from the paper form's own wording (the
// lettered Measuring Guide lines, then the handwritten "Other Measurements"
// lines) so the alias table in src/lib/measurement-import/aliases.ts maps
// each one to its key. `value` is a fraction for waist, to prove the import
// handles a handwritten fraction.

export const ROSA_FORM = Object.freeze({
  name: "Rosa Diaz",
  castAs: "Musicians",
  sizes: Object.freeze({ shirt: "S", pant: "4", shoe: "Women's 7" }),
  fields: Object.freeze([
    Object.freeze({ label: "A chest", key: "chest", value: "36" }),
    Object.freeze({ label: "B waist", key: "waist", value: "26 1/2" }),
    Object.freeze({ label: "C hip", key: "hips", value: "38" }),
    Object.freeze({ label: "D inseam", key: "inseam", value: "30" }),
    Object.freeze({ label: "E nape to floor", key: "nape_to_floor", value: "58" }),
    Object.freeze({ label: "F height", key: "height", value: "65" }),
    Object.freeze({ label: "G shoulders across back", key: "shoulder", value: "15 1/2" }),
    Object.freeze({ label: "Head", key: "head", value: "22.5" }),
    Object.freeze({ label: "Neck", key: "neck", value: "13.5" }),
  ]),
});
