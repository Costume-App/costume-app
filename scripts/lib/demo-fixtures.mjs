// Fixture data for the training-video demo org. Pure data plus validation;
// seed-demo-org.mjs pushes it through the app's API so every computed value
// on camera is what the product computes. Dates are offsets from "today".
export const MEASUREMENT_UNITS = Object.freeze({
  height: "in", weight: "lb", chest: "in", waist: "in", hips: "in", shoulder: "in",
  sleeve: "in", back_length: "in", inseam: "in", outseam: "in", neck: "in",
  arm_circumference: "in", wrist: "in", thigh: "in", knee: "in", head: "in", nape_to_floor: "in",
});

export function showDate(offsetDays, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const m = (height, chest, waist, hips, inseam, sleeve, neck, head) =>
  ({ height, chest, waist, hips, inseam, sleeve, neck, head });

export const DEMO_PRODUCTIONS = [
  {
    key: "midsummer",
    title: "A Midsummer Night's Dream",
    notes: "Fairy world in greens and golds; Athenians in muslin and cream.",
    active: true,
    showings: [
      { offsetDays: 42, time: "19:30", label: "Opening Night" },
      { offsetDays: 43, time: "19:30", label: null },
      { offsetDays: 44, time: "14:00", label: "Matinee" },
    ],
    roles: [
      { name: "Titania" }, { name: "Oberon" }, { name: "Puck" }, { name: "Bottom" },
      { name: "Hermia" }, { name: "Lysander" }, { name: "Helena" }, { name: "Demetrius" },
      { name: "Fairies", isEnsemble: true },
    ],
    cast: [
      { role: "Titania", performer: "Priya Natarajan" },
      { role: "Oberon", performer: "Marcus Ellery" },
      { role: "Puck", performer: "June Okafor" },
      { role: "Bottom", performer: "Theo Brandt" },
      { role: "Hermia", performer: "Lucia Moreno" },
      { role: "Lysander", performer: "Sam Whitfield" },
      { role: "Helena", performer: "Ava Lindqvist" },
      { role: "Demetrius", performer: "Rafael Costa" },
      { role: "Fairies", performer: "Nell Harper" },
      { role: "Fairies", performer: "Iris Chen" },
    ],
    measurements: {
      "Priya Natarajan": m(65, 34, 27, 37, 30, 22.5, 13, 21.5),
      "Marcus Ellery": m(72, 40, 33, 39, 32, 25, 15.5, 22.75),
      "June Okafor": m(61, 31, 25, 34, 27.5, 21, 12.5, 21),
      "Theo Brandt": m(69, 44, 38, 42, 30.5, 24, 16.5, 23),
      "Lucia Moreno": m(63, 33, 26, 36, 29, 22, 12.75, 21.25),
    },
  },
  {
    key: "pirates",
    title: "The Pirates of Penzance",
    notes: "Last spring's show. Pirate coats went back to House Inventory.",
    active: false,
    showings: [{ offsetDays: -150, time: "19:00", label: "Opening Night" }],
    roles: [{ name: "Pirate King" }, { name: "Frederic" }, { name: "Mabel" }, { name: "Ruth" }],
    cast: [
      { role: "Pirate King", performer: "Marcus Ellery" },
      { role: "Frederic", performer: "Sam Whitfield" },
      { role: "Mabel", performer: "Lucia Moreno" },
      { role: "Ruth", performer: "Nell Harper" },
    ],
    measurements: {},
  },
];

export function validateFixtures(list) {
  for (const p of list) {
    const roles = new Set(p.roles.map((r) => r.name));
    const cast = new Set(p.cast.map((c) => c.performer));
    for (const c of p.cast) {
      if (!roles.has(c.role)) throw new Error(`${p.key}: cast references unknown role "${c.role}"`);
    }
    for (const [who, values] of Object.entries(p.measurements)) {
      if (!cast.has(who)) throw new Error(`${p.key}: measurements for "${who}", who is not cast`);
      for (const k of Object.keys(values)) {
        if (!(k in MEASUREMENT_UNITS)) throw new Error(`${p.key}: unknown measurement key "${k}"`);
      }
    }
  }
  return list;
}
