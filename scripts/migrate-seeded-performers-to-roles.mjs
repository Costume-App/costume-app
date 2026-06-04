import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// For each production, move performers that have NO casting (i.e. seeded characters,
// not real cast members) into roles, then delete those performer rows.
const { data: productions, error: pErr } = await supabase.from("productions").select("id, title");
if (pErr) throw pErr;

for (const prod of productions) {
  const { data: performers, error: perfErr } = await supabase
    .from("performers")
    .select("id, label, created_at")
    .eq("production_id", prod.id)
    .order("created_at", { ascending: true });
  if (perfErr) throw perfErr;

  const { data: castings, error: cErr } = await supabase
    .from("castings")
    .select("performer_id")
    .eq("production_id", prod.id);
  if (cErr) throw cErr;
  const castPerformerIds = new Set((castings ?? []).map((c) => c.performer_id));

  const toConvert = (performers ?? []).filter((p) => !castPerformerIds.has(p.id));
  if (toConvert.length === 0) {
    console.log(`${prod.title}: nothing to convert`);
    continue;
  }

  // Skip names already present as roles (idempotent).
  const { data: existingRoles } = await supabase.from("roles").select("name").eq("production_id", prod.id);
  const haveRole = new Set((existingRoles ?? []).map((r) => r.name));

  const roleRows = toConvert
    .filter((p) => !haveRole.has(p.label))
    .map((p, i) => ({ production_id: prod.id, name: p.label, display_order: (i + 1) * 10 }));

  if (roleRows.length > 0) {
    const { error: insErr } = await supabase.from("roles").insert(roleRows);
    if (insErr) throw insErr;
  }

  const ids = toConvert.map((p) => p.id);
  const { error: delErr } = await supabase.from("performers").delete().in("id", ids);
  if (delErr) throw delErr;

  console.log(`${prod.title}: converted ${roleRows.length} characters to roles, removed ${ids.length} seeded performers`);
}
