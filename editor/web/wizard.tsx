/**
 * "Add something new" — the wizard.
 *
 * The editor could not create anything at all before this: you could change next
 * month's meeting but not add one, which is the most common thing a chapter
 * actually needs to do.
 *
 * It walks rather than presents a form, because the interesting decisions are
 * ones a first-time editor doesn't know to ask about: is this meeting a one-off
 * or does it repeat (which changes where the file lives and whether the calendar
 * keeps generating it), and does this go live on merge or wait as a draft. The
 * URL is shown before anything is written, since that is the part nobody can fix
 * later without a redirect.
 *
 * It never sends a path. `planNewItem` in the Worker owns every naming
 * convention, so there is exactly one place that knows a post lives at
 * `content/posts/<year>/<date>-<slug>.md`.
 */

import { useMemo, useState } from "react";
import { Picker } from "./picker";
import { api, type EventCategory, type NewKind } from "./api";

const KINDS: {
  kind: NewKind;
  label: string;
  icon: string;
  blurb: string;
}[] = [
  {
    kind: "post",
    label: "Blog post",
    icon: "📰",
    blurb: "A statement, newsletter, or write-up. Appears on the blog.",
  },
  {
    kind: "event",
    label: "One-off event",
    icon: "📅",
    blurb: "Happens once — a protest, a social, a special meeting.",
  },
  {
    kind: "series",
    label: "Repeating meeting",
    icon: "🔁",
    blurb:
      "Meets on a schedule. Stored as one rule, so the calendar keeps listing it forever without anyone re-entering dates.",
  },
  {
    kind: "page",
    label: "Page",
    icon: "📄",
    blurb: "Standing information — a working group, a resource, a guide.",
  },
];

/** Same slug rule as the Worker, so the previewed URL is the real one. */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

const todayLocal = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Mirrors planNewItem so the editor sees the URL before committing to it. */
function previewUrl(
  kind: NewKind,
  title: string,
  date: string,
  parent: string,
): string {
  const stem = slugify(title);
  if (!stem) return "";
  if (kind === "page") {
    const p = parent.replace(/^\/+|\/+$/g, "");
    return `/${p ? `${p}/` : ""}${stem}/`;
  }
  if (kind === "post") {
    const [y, m, d] = date.split("-");
    return `/${y}/${m}/${d}/${stem}/`;
  }
  return `/event/${kind === "series" ? stem : `${date}-${stem}`}/`;
}

export function Wizard({
  base,
  production,
  categories,
  pages,
  onCreated,
  onCancel,
}: {
  base: string;
  /** The branch where merging publishes; drives the draft default. */
  production: string;
  categories: EventCategory[];
  /** Existing page slugs, for choosing a parent. */
  pages: string[];
  onCreated: (path: string) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<NewKind | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [parent, setParent] = useState("");
  const [venue, setVenue] = useState("");
  const [isVirtual, setIsVirtual] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const onProduction = base === production;
  const [draft, setDraft] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = useMemo(
    () => (kind ? previewUrl(kind, title, date, parent) : ""),
    [kind, title, date, parent],
  );

  const isEvent = kind === "event" || kind === "series";
  const offered = categories.filter((c) => !c.retired);

  async function create() {
    if (!kind) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await api.create({
        base,
        kind,
        title,
        date,
        ...(isEvent ? { startTime, endTime, venue, isVirtual } : {}),
        ...(kind === "page" ? { parent } : {}),
        ...(kind === "post" ? { summary } : {}),
        categories: isEvent || kind === "post" ? picked : [],
        draft: onProduction ? draft : false,
      });
      onCreated(r.path);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Step 1 — what kind of thing. Deliberately its own screen: one-off vs
  // repeating is the decision that determines everything downstream.
  if (!kind)
    return (
      <div className="wiz">
        <h2>What are you adding?</h2>
        <ul className="wiz__kinds">
          {KINDS.map((k) => (
            <li key={k.kind}>
              <button type="button" onClick={() => setKind(k.kind)}>
                <span className="wiz__icon" aria-hidden="true">
                  {k.icon}
                </span>
                <span>
                  <b>{k.label}</b>
                  <span className="wiz__blurb">{k.blurb}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="wiz__actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );

  const chosen = KINDS.find((k) => k.kind === kind)!;

  return (
    <div className="wiz">
      <h2>
        <span aria-hidden="true">{chosen.icon}</span> New {chosen.label}
      </h2>

      <label className="wiz__field">
        <span>Title</span>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            kind === "series"
              ? "Housing Working Group Meeting"
              : "Give it a name"
          }
        />
      </label>

      {kind !== "page" && (
        <label className="wiz__field">
          <span>{kind === "series" ? "First meeting" : "Date"}</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
      )}

      {isEvent && (
        <>
          <div className="wiz__row">
            <label className="wiz__field">
              <span>Starts</span>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </label>
            <label className="wiz__field">
              <span>Ends</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </label>
          </div>
          <label className="wiz__field">
            <span>Where</span>
            <input
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Venue name, or leave blank for online"
            />
          </label>
          <label className="wiz__check">
            <input
              type="checkbox"
              checked={isVirtual}
              onChange={(e) => setIsVirtual(e.target.checked)}
            />
            <span>
              Has an online component
              <span className="wiz__hint">
                Shown with a 💻 or 🔀 marker on the calendar.
              </span>
            </span>
          </label>
        </>
      )}

      {kind === "page" && (
        <div className="wiz__field">
          <span aria-hidden="true">Inside another page (optional)</span>
          <Picker
            className="pick--block"
            label="Inside another page"
            showLabel={false}
            placeholder="Filter pages…"
            value={parent}
            options={[
              { value: "", label: "Top level" },
              ...pages.map((p) => ({ value: p, label: `/${p}/` })),
            ]}
            onChange={setParent}
          />
        </div>
      )}

      {kind === "post" && (
        <label className="wiz__field">
          <span>Summary (optional)</span>
          <textarea
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One or two sentences, shown on the blog index."
          />
        </label>
      )}

      {(isEvent || kind === "post") && offered.length > 0 && (
        <fieldset className="wiz__cats">
          <legend>
            Categories
            <span className="wiz__hint">
              These drive the calendar&rsquo;s colours, its filters, and the
              per-category subscription feeds — so pick from the list rather
              than inventing one.
            </span>
          </legend>
          <div className="wiz__chips">
            {offered.map((c) => {
              const on = picked.includes(c.label);
              return (
                <button
                  key={c.label}
                  type="button"
                  className={`wiz__chip${on ? " on" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((cur) =>
                      on ? cur.filter((x) => x !== c.label) : [...cur, c.label],
                    )
                  }
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          {picked
            .map((label) => offered.find((c) => c.label === label))
            .filter((c) => c?.note)
            .map((c) => (
              <p key={c!.label} className="wiz__note">
                <b>{c!.label}:</b> {c!.note}
              </p>
            ))}
        </fieldset>
      )}

      {url && (
        <p className="wiz__url">
          Its address will be <code>{url}</code>
          <span className="wiz__hint">
            Changing this later needs a redirect, so it&rsquo;s worth getting
            right now.
          </span>
        </p>
      )}

      {onProduction ? (
        <label className="wiz__check">
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
          />
          <span>
            Keep as a draft for now
            <span className="wiz__hint">
              You&rsquo;re working against <code>{base}</code>, where merging
              publishes. A draft is left out of the built site entirely — no
              public address — until someone unticks this.
            </span>
          </span>
        </label>
      ) : (
        <p className="wiz__hint">
          You&rsquo;re working on <code>{base}</code>, not{" "}
          <code>{production}</code>, so this isn&rsquo;t public either way — no
          draft flag needed.
        </p>
      )}

      {err && <p className="msg err">✗ {err}</p>}

      <div className="wiz__actions">
        <button type="button" className="ghost" onClick={() => setKind(null)}>
          ← Back
        </button>
        <button
          type="button"
          className="save"
          disabled={busy || !title.trim() || !url}
          onClick={create}
        >
          {busy ? "creating…" : `Create ${chosen.label.toLowerCase()}`}
        </button>
      </div>
    </div>
  );
}
