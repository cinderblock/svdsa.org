/**
 * Smart frontmatter form.
 *
 * Renders typed widgets per field (toggles for booleans, datetime pickers for
 * dates, comma lists for string arrays) instead of a wall of text inputs.
 * Legacy WordPress plumbing (id, slug, path) lives in a collapsed "Advanced"
 * section — `id` is the old WP post ID, kept read-only for reference.
 *
 * Round-trip rule: only fields the editor actually TOUCHED are rebuilt into
 * the saved frontmatter; untouched fields keep their original value verbatim
 * (so date formats, seconds, etc. never churn in git diffs).
 */

import { useState } from "react";
import type { Recurrence } from "../../app/lib/recurrence";
import { RecurrenceField } from "./recurrence-field";

export type FieldKind =
  | "readonly"
  | "toggle"
  | "datetime"
  | "list"
  | "text"
  | "recurrence"
  | "json";

/** What a widget can hold. `recurrence` is an object; the rest are scalars. */
export type FieldValue = string | boolean | Recurrence | null;

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  advanced: boolean;
  /** editable value as shown in the widget */
  initial: FieldValue;
}

const DATE_KEYS = new Set(["date", "modified", "start", "end"]);
const ADVANCED_KEYS = new Set(["id", "slug", "path", "modified", "timezone"]);
const DATE_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/;

/** '2026-01-21 18:30:00' | '2026-01-21T18:30:00' → '2026-01-21T18:30' */
function toDatetimeLocal(v: string): string | null {
  const m = v.match(DATE_RE);
  return m ? `${m[1]}T${m[2]}` : null;
}

/** Rebuild an edited datetime in the ORIGINAL string's format. */
function fromDatetimeLocal(input: string, original: string): string {
  const sep = original.includes("T") ? "T" : " ";
  const seconds = /:\d{2}:\d{2}/.test(original) ? ":00" : "";
  return input.replace("T", sep) + seconds;
}

export function classify(fm: Record<string, unknown>): FieldSpec[] {
  const specs: FieldSpec[] = [];
  for (const [key, v] of Object.entries(fm)) {
    if (key === "title") continue; // rendered separately, prominently
    const advanced = ADVANCED_KEYS.has(key);
    if (key === "id") {
      specs.push({ key, kind: "readonly", advanced: true, initial: String(v) });
    } else if (key === "recurrence") {
      // A first-class widget, not a JSON blob — editors must be able to
      // reschedule a meeting without touching an RRULE string.
      specs.push({
        key,
        kind: "recurrence",
        advanced: false,
        initial: (v ?? null) as Recurrence | null,
      });
    } else if (typeof v === "boolean") {
      specs.push({ key, kind: "toggle", advanced, initial: v });
    } else if (
      typeof v === "string" &&
      DATE_KEYS.has(key) &&
      toDatetimeLocal(v)
    ) {
      specs.push({
        key,
        kind: "datetime",
        advanced,
        initial: toDatetimeLocal(v)!,
      });
    } else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      specs.push({ key, kind: "list", advanced, initial: v.join(", ") });
    } else if (typeof v === "string" || typeof v === "number") {
      specs.push({ key, kind: "text", advanced, initial: String(v) });
    } else if (v !== null && v !== undefined) {
      // objects (venue …) — visible but not editable yet
      specs.push({
        key,
        kind: "json",
        advanced: true,
        initial: JSON.stringify(v),
      });
    }
  }
  // Anything with a start time is an event, so offer the recurrence editor even
  // when the item doesn't repeat yet — otherwise a one-off could never be TURNED
  // INTO a recurring meeting from the browser.
  if ("start" in fm && !specs.some((s) => s.kind === "recurrence"))
    specs.push({
      key: "recurrence",
      kind: "recurrence",
      advanced: false,
      initial: null,
    });

  // Editable basics first, advanced last.
  return specs.sort((a, b) => Number(a.advanced) - Number(b.advanced));
}

/** Merge touched edits back over the original frontmatter. */
export function buildFrontmatter(
  original: Record<string, unknown>,
  specs: FieldSpec[],
  values: Record<string, FieldValue>,
  stampModified: boolean,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...original };
  for (const s of specs) {
    const v = values[s.key];
    if (v === undefined || v === s.initial) continue; // untouched → keep verbatim
    const orig = original[s.key];
    if (s.kind === "recurrence") {
      // null means "stop repeating" — drop the key entirely.
      if (v === null) delete out[s.key];
      else out[s.key] = v;
    } else if (s.kind === "toggle") out[s.key] = v === true;
    else if (s.kind === "datetime")
      out[s.key] = fromDatetimeLocal(String(v), String(orig));
    else if (s.kind === "list")
      out[s.key] = String(v)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
    else if (s.kind === "text")
      out[s.key] = typeof orig === "number" ? Number(v) : String(v);
  }
  // Stamp modification time on save when the item tracks one.
  if ("modified" in out && stampModified) {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    out.modified = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  }
  return out;
}

export function FrontmatterForm({
  specs,
  values,
  anchorStart,
  onChange,
}: {
  specs: FieldSpec[];
  values: Record<string, FieldValue>;
  /** The item's `start`, so the recurrence widget knows the series anchor. */
  anchorStart?: string;
  onChange: (key: string, value: FieldValue) => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  // The recurrence editor is a full-width block, not an inline field.
  const recurrence = specs.find((s) => s.kind === "recurrence");
  const basic = specs.filter((s) => !s.advanced && s.kind !== "recurrence");
  const advanced = specs.filter((s) => s.advanced);

  const field = (s: FieldSpec) => {
    const v = values[s.key] ?? s.initial;
    switch (s.kind) {
      case "readonly":
      case "json":
        return (
          <span className="ro">
            {typeof v === "object" && v !== null
              ? JSON.stringify(v)
              : String(v)}
            {s.key === "id" && <em> (WordPress ID)</em>}
          </span>
        );
      case "toggle":
        return (
          <button
            type="button"
            role="switch"
            aria-checked={v === true}
            className={`toggle${v === true ? " on" : ""}`}
            onClick={() => onChange(s.key, v !== true)}
          >
            <span className="knob" />
          </button>
        );
      case "datetime":
        return (
          <input
            type="datetime-local"
            value={String(v)}
            onChange={(e) => onChange(s.key, e.target.value)}
          />
        );
      default:
        return (
          <input
            value={String(v)}
            onChange={(e) => onChange(s.key, e.target.value)}
          />
        );
    }
  };

  return (
    <div className="fm">
      {basic.map((s) => (
        <label key={s.key} className="fmField">
          <span>{s.key}</span>
          {field(s)}
        </label>
      ))}
      {recurrence && (
        <RecurrenceField
          // `in` rather than `??`: null is a MEANINGFUL value here ("stopped
          // repeating"), and ?? would fall back to the stored rule.
          value={
            (recurrence.key in values
              ? values[recurrence.key]
              : recurrence.initial) as Recurrence | null
          }
          anchorStart={anchorStart ?? ""}
          onChange={(next) => onChange(recurrence.key, next)}
        />
      )}
      {advanced.length > 0 && (
        <>
          <button
            type="button"
            className="fmAdvancedToggle"
            onClick={() => setShowAdvanced((x) => !x)}
          >
            {showAdvanced ? "▾" : "▸"} advanced
          </button>
          {showAdvanced &&
            advanced.map((s) => (
              <label key={s.key} className="fmField adv">
                <span>{s.key}</span>
                {field(s)}
              </label>
            ))}
        </>
      )}
    </div>
  );
}
