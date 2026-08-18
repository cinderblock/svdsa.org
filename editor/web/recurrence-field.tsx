/**
 * Recurrence editor — the widget that lets a non-technical editor change when a
 * meeting repeats, cancel one occurrence, or move it, without ever seeing an
 * RRULE string.
 *
 * It reads and writes the same `recurrence: {rrule, exdate, rdate}` frontmatter
 * the site stores, and previews upcoming dates with **the same engine the site
 * and the .ics feeds use** (`app/lib/recurrence.ts`) — so what an editor sees
 * here is exactly what members will get on the calendar and in their
 * subscriptions.
 */

import { useMemo, useState } from "react";
import {
  describeRecurrence,
  occurrences,
  WEEKDAYS,
  type Recurrence,
  type Weekday,
} from "../../app/lib/recurrence";
import {
  toDraft,
  toRRule,
  weekdayOfDate,
  type Draft,
} from "./recurrence-model";
import { chapterDay } from "../../app/lib/today";

const DAY_LABEL: Record<Weekday, string> = {
  SU: "Sun",
  MO: "Mon",
  TU: "Tue",
  WE: "Wed",
  TH: "Thu",
  FR: "Fri",
  SA: "Sat",
};
const ORDINALS = [
  { value: 1, label: "1st" },
  { value: 2, label: "2nd" },
  { value: 3, label: "3rd" },
  { value: 4, label: "4th" },
  { value: 5, label: "5th" },
  { value: -1, label: "last" },
];
const INTERVALS = [
  { value: 1, label: "Every week" },
  { value: 2, label: "Every other week" },
  { value: 3, label: "Every 3 weeks" },
  { value: 4, label: "Every 4 weeks" },
];

const today = () => chapterDay();
const prettyDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function RecurrenceField({
  value,
  anchorStart,
  onChange,
}: {
  value: Recurrence | null;
  /** The event's `start` — supplies the series anchor date and time-of-day. */
  anchorStart: string;
  onChange: (next: Recurrence | null) => void;
}) {
  const anchorDate = anchorStart.slice(0, 10);
  const anchorWeekday = weekdayOfDate(anchorDate);
  const [newSkip, setNewSkip] = useState("");
  const [newMove, setNewMove] = useState("");

  const draft = toDraft(value, anchorWeekday);
  const on = value !== null;

  const update = (patch: Partial<Draft>) =>
    onChange({ ...(value ?? {}), rrule: toRRule({ ...draft, ...patch }) });

  const setList = (key: "exdate" | "rdate", list: string[]) => {
    const next: Recurrence = { ...(value as Recurrence), [key]: list };
    if (!list.length) delete next[key];
    onChange(next);
  };

  // Preview with the real engine, so this can't disagree with the site.
  const preview = useMemo(() => {
    if (!value) return [];
    const from = anchorDate < today() ? today() : anchorDate;
    try {
      const to = new Date(Date.parse(`${from}T00:00:00Z`) + 400 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      return occurrences(value, anchorDate, from, to).slice(0, 6);
    } catch (e) {
      return [`⚠ ${(e as Error).message}`];
    }
  }, [value, anchorDate]);

  return (
    <div className="rec">
      {/* A div, not a label: a <label> can't name a <button>, and wrapping one
          leaks the surrounding text into the control's accessible name. */}
      <div className="rec__enable">
        <button
          type="button"
          role="switch"
          aria-label="This event repeats"
          aria-checked={on}
          className={`toggle${on ? " on" : ""}`}
          onClick={() =>
            on
              ? onChange(null)
              : onChange({ rrule: toRRule(toDraft(null, anchorWeekday)) })
          }
        >
          <span className="knob" />
        </button>
        <span>
          <b>This event repeats</b>
          {on && <em> — {describeRecurrence(value)}</em>}
        </span>
      </div>

      {on && (
        <>
          <div className="rec__row">
            <label>
              <span>Repeats</span>
              <select
                aria-label="Repeats"
                value={draft.freq}
                onChange={(e) =>
                  update({ freq: e.target.value as Draft["freq"] })
                }
              >
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </label>

            {draft.freq === "WEEKLY" ? (
              <label>
                <span>How often</span>
                <select
                  aria-label="How often"
                  value={draft.interval}
                  onChange={(e) => update({ interval: Number(e.target.value) })}
                >
                  {INTERVALS.map((i) => (
                    <option key={i.value} value={i.value}>
                      {i.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <fieldset className="rec__nths">
                {/* Toggles, not a dropdown: three chapter meetings happen twice
                    a month on the same weekday (2nd AND 4th Thursday), which a
                    single-choice control cannot express at all. */}
                <legend>Which ones</legend>
                {ORDINALS.map((o) => {
                  const on = draft.nths.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={on}
                      className={on ? "on" : ""}
                      onClick={() =>
                        update({
                          // Keep first-seen order, and never let the list empty
                          // out — a monthly rule with no ordinal is invalid.
                          nths: on
                            ? draft.nths.filter((n) => n !== o.value).length
                              ? draft.nths.filter((n) => n !== o.value)
                              : draft.nths
                            : [...draft.nths, o.value],
                        })
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </fieldset>
            )}

            <label>
              <span>Ends</span>
              <input
                aria-label="Ends"
                type="date"
                value={draft.until}
                onChange={(e) => update({ until: e.target.value })}
                placeholder="never"
              />
            </label>
          </div>

          <div className="rec__days">
            <span className="rec__label">
              {draft.freq === "WEEKLY" ? "On these days" : "On this day"}
            </span>
            <div>
              {WEEKDAYS.map((d) => {
                const active = draft.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={active}
                    className={`rec__day${active ? " on" : ""}`}
                    onClick={() =>
                      update({
                        days:
                          draft.freq === "MONTHLY"
                            ? [d]
                            : active
                              ? draft.days.filter((x) => x !== d)
                              : [...draft.days, d].sort(
                                  (a, b) =>
                                    WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b),
                                ),
                      })
                    }
                  >
                    {DAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rec__row">
            <label>
              <span>Skip a date (cancelled)</span>
              <span className="rec__add">
                <input
                  aria-label="Skip a date"
                  type="date"
                  value={newSkip}
                  onChange={(e) => setNewSkip(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!newSkip}
                  onClick={() => {
                    setList("exdate", [
                      ...new Set([...(value.exdate ?? []), newSkip]),
                    ]);
                    setNewSkip("");
                  }}
                >
                  Skip
                </button>
              </span>
            </label>
            <label>
              <span>Add an extra date (moved to)</span>
              <span className="rec__add">
                <input
                  aria-label="Add an extra date"
                  type="date"
                  value={newMove}
                  onChange={(e) => setNewMove(e.target.value)}
                />
                <button
                  type="button"
                  disabled={!newMove}
                  onClick={() => {
                    setList("rdate", [
                      ...new Set([...(value.rdate ?? []), newMove]),
                    ]);
                    setNewMove("");
                  }}
                >
                  Add
                </button>
              </span>
            </label>
          </div>

          {(value.exdate?.length || value.rdate?.length) && (
            <div className="rec__chips">
              {(value.exdate ?? []).map((d) => (
                <span key={`x${d}`} className="rec__chip rec__chip--skip">
                  skipped {prettyDate(d)}
                  <button
                    type="button"
                    aria-label={`Un-skip ${d}`}
                    onClick={() =>
                      setList(
                        "exdate",
                        (value.exdate ?? []).filter((x) => x !== d),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
              {(value.rdate ?? []).map((d) => (
                <span key={`r${d}`} className="rec__chip rec__chip--add">
                  added {prettyDate(d)}
                  <button
                    type="button"
                    aria-label={`Remove ${d}`}
                    onClick={() =>
                      setList(
                        "rdate",
                        (value.rdate ?? []).filter((x) => x !== d),
                      )
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="rec__preview">
            <span className="rec__label">Next dates</span>
            {preview.length ? (
              <ol>
                {preview.map((d) => (
                  <li key={d}>{d.startsWith("⚠") ? d : prettyDate(d)}</li>
                ))}
              </ol>
            ) : (
              <p className="rec__none">
                No upcoming dates — check the day and the “Ends” date.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
