"use client";

import { analyzeImport, type ImportAnalysis } from "@/lib/cast-import/analyze";
import { describeCounts } from "@/lib/cast-import/counts";
import {
  fitRoleToType,
  removeCasting,
  removeRole,
  renameNewRole,
  setAssignment,
  setCastTarget,
  setPerformerTarget,
  setRoleEnsemble,
  setRoleTarget,
} from "@/lib/cast-import/draft-edits";
import type { Draft, DraftRole, ExistingData, ImportCasting } from "@/lib/cast-import/types";

interface Shared {
  draft: Draft;
  existing: ExistingData;
  analysis: ImportAnalysis;
  busy: boolean;
  onChange: (draft: Draft) => void;
}

// Step 2 of the import: everything the AI read, editable, with conflicts that must be fixed first.
export function CastImportReview({
  draft,
  existing,
  busy,
  onChange,
  onImport,
  onStartOver,
}: {
  draft: Draft;
  existing: ExistingData;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onImport: () => void;
  onStartOver: () => void;
}) {
  const analysis = analyzeImport(draft, existing);
  const { casts, roles, performers, castings } = analysis.counts;
  const total = casts + roles + performers + castings;
  const shared: Shared = { draft, existing, analysis, busy, onChange };
  const general = analysis.conflicts.filter((c) => c.castingKeys.length === 0 && !c.roleKey);

  return (
    <div className="space-y-4">
      {draft.casts.length > 0 && (
        <div className="space-y-2">
          <span className="lbl block">Casts</span>
          {draft.casts.map((c) => (
            <label key={c.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 break-words">{c.label ?? "No cast named"} →</span>
              <select
                className="field !p-1.5 text-sm"
                value={c.target.kind === "existing" ? c.target.castId : "new"}
                disabled={busy}
                onChange={(e) =>
                  onChange(
                    setCastTarget(
                      draft,
                      c.key,
                      e.target.value === "new"
                        ? { kind: "new", name: c.label ?? "New cast" }
                        : { kind: "existing", castId: e.target.value },
                    ),
                  )
                }
              >
                {existing.casts.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
                <option value="new">New cast{c.label ? `: ${c.label}` : ""}</option>
              </select>
            </label>
          ))}
        </div>
      )}

      <ul className="space-y-3">
        {draft.roles.map((role) => (
          <RoleReviewCard key={role.key} role={role} {...shared} />
        ))}
      </ul>

      {general.map((c, i) => (
        <p key={i} className="text-sm text-[var(--red)]">
          {c.message}
        </p>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onImport}
          disabled={busy || analysis.conflicts.length > 0 || total === 0}
          className="btn-primary"
        >
          {busy ? "Importing…" : total === 0 ? "Nothing new to import" : `Import ${describeCounts(analysis.counts)}`}
        </button>
        <button type="button" onClick={onStartOver} disabled={busy} className="link-muted text-sm">
          Start over
        </button>
        {analysis.conflicts.length > 0 && (
          <span className="text-sm text-[var(--red)]">
            Fix {analysis.conflicts.length} {analysis.conflicts.length === 1 ? "issue" : "issues"} to import.
          </span>
        )}
      </div>
    </div>
  );
}

function RoleReviewCard({ role, draft, existing, analysis, busy, onChange }: Shared & { role: DraftRole }) {
  const target = role.target;
  const existingRole = target.kind === "existing" ? existing.roles.find((r) => r.id === target.roleId) : undefined;
  const isEnsemble = target.kind === "existing" ? (existingRole?.isEnsemble ?? false) : target.isEnsemble;
  const castings = draft.castings.filter((c) => c.roleKey === role.key);
  const showCast = draft.casts.length > 1;
  const mismatch = analysis.conflicts.find((c) => c.kind === "role_type_mismatch" && c.roleKey === role.key);
  const roleProblems = analysis.conflicts.filter(
    (c) => c.roleKey === role.key && c.castingKeys.length === 0,
  );

  return (
    <li className="space-y-3 rounded-xl border border-[var(--field-line)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        {target.kind === "new" ? (
          <input
            className="field min-w-0 flex-1 !p-1.5 font-semibold"
            value={target.name}
            aria-label="Role name"
            disabled={busy}
            onChange={(e) => onChange(renameNewRole(draft, role.key, e.target.value))}
          />
        ) : (
          <span className="min-w-0 flex-1 break-words font-semibold">{existingRole?.name ?? role.sourceName}</span>
        )}
        <select
          className="field !p-1.5 text-sm"
          aria-label={`Where ${role.sourceName} goes`}
          value={target.kind === "existing" ? target.roleId : "new"}
          disabled={busy}
          onChange={(e) =>
            onChange(
              setRoleTarget(
                draft,
                role.key,
                e.target.value === "new" ? "new" : { kind: "existing", roleId: e.target.value },
              ),
            )
          }
        >
          <option value="new">New role</option>
          {existing.roles.map((r) => (
            <option key={r.id} value={r.id}>
              Add to: {r.name}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={isEnsemble}
            disabled={busy || target.kind === "existing"}
            onChange={(e) => onChange(setRoleEnsemble(draft, role.key, e.target.checked))}
          />
          Ensemble
        </label>
        <button
          type="button"
          onClick={() => onChange(removeRole(draft, role.key))}
          disabled={busy}
          className="link-muted text-sm"
        >
          Remove
        </button>
      </div>

      {roleProblems.map((c, i) => (
        <p key={i} className="text-sm text-[var(--red)]">
          {c.message}
        </p>
      ))}
      {mismatch && (
        <p className="text-sm text-[var(--red)]">
          {mismatch.message}{" "}
          <button
            type="button"
            onClick={() => onChange(fitRoleToType(draft, role.key, isEnsemble))}
            disabled={busy}
            className="link-red"
          >
            Fit to this role
          </button>
        </p>
      )}

      {castings.length === 0 ? (
        <p className="text-sm muted">No one cast yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {castings.map((c) => (
            <CastingRow
              key={c.key}
              casting={c}
              showCast={showCast}
              draft={draft}
              existing={existing}
              analysis={analysis}
              busy={busy}
              onChange={onChange}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function CastingRow({
  casting,
  showCast,
  draft,
  existing,
  analysis,
  busy,
  onChange,
}: Shared & { casting: ImportCasting; showCast: boolean }) {
  const performer = draft.performers.find((p) => p.key === casting.performerKey);
  if (!performer) return null;
  const pt = performer.target;
  const name =
    pt.kind === "existing"
      ? (existing.performers.find((p) => p.id === pt.performerId)?.name ?? performer.sourceName)
      : pt.name;
  const cast = draft.casts.find((c) => c.key === casting.castKey);
  const otherRoles = new Set(
    draft.castings
      .filter((c) => c.performerKey === performer.key && c.roleKey !== casting.roleKey)
      .map((c) => c.roleKey),
  ).size;
  const already = analysis.alreadyCast.has(casting.key);
  const duplicate = analysis.duplicates.has(casting.key);
  const problems = analysis.conflicts.filter(
    (c) => c.kind !== "role_type_mismatch" && c.castingKeys.includes(casting.key),
  );
  // Where an existing performer with this name is already cast, to tell same-named people apart.
  const rolesOfExisting = (performerId: string) => {
    const names = [
      ...new Set(
        existing.castings
          .filter((c) => c.performerId === performerId)
          .map((c) => existing.roles.find((r) => r.id === c.roleId)?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    ];
    return names.length > 0 ? `in ${names.join(", ")}` : "no roles yet";
  };

  return (
    <li className={`space-y-1 ${already || duplicate ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="min-w-0 break-words font-medium">{name}</span>
        {performer.candidateIds.length > 0 ? (
          <select
            className="field !p-1 text-xs"
            aria-label={`Who is ${performer.sourceName}`}
            value={pt.kind === "existing" ? pt.performerId : "new"}
            disabled={busy}
            onChange={(e) =>
              onChange(
                setPerformerTarget(
                  draft,
                  performer.key,
                  e.target.value === "new"
                    ? { kind: "new", name: performer.sourceName }
                    : { kind: "existing", performerId: e.target.value },
                ),
              )
            }
          >
            {performer.candidateIds.map((id) => (
              <option key={id} value={id}>
                Existing performer ({rolesOfExisting(id)})
              </option>
            ))}
            <option value="new">New person</option>
          </select>
        ) : (
          <span className="chip text-xs">new</span>
        )}
        {otherRoles > 0 && (
          <span className="text-xs muted">
            also in {otherRoles} other {otherRoles === 1 ? "role" : "roles"}
          </span>
        )}
        {showCast && cast && <span className="text-xs muted">{cast.label ?? "no cast named"}</span>}
        {casting.assignment !== "ensemble" && (
          <select
            className="field !p-1 text-xs"
            aria-label={`${name}'s part`}
            value={casting.assignment}
            disabled={busy || already || duplicate}
            onChange={(e) => onChange(setAssignment(draft, casting.key, e.target.value as "primary" | "understudy"))}
          >
            <option value="primary">Primary</option>
            <option value="understudy">Understudy</option>
          </select>
        )}
        {already && <span className="text-xs muted">already cast</span>}
        {duplicate && <span className="text-xs muted">listed twice</span>}
        <button
          type="button"
          aria-label={`Remove ${name}`}
          onClick={() => onChange(removeCasting(draft, casting.key))}
          disabled={busy}
          className="link-muted"
        >
          ×
        </button>
      </div>
      {problems.map((p, i) => (
        <p key={i} className="text-xs text-[var(--red)]">
          {p.message}
        </p>
      ))}
    </li>
  );
}
