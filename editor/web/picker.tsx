/**
 * A filterable popover picker — our replacement for `<select>`.
 *
 * A native select can't be styled to match the app, can't show a second line
 * per option, and can't carry actions in its footer; on the editor's red header
 * it renders as an unrelated OS widget. This is the ARIA **combobox** pattern
 * rather than a listbox: the filter input keeps DOM focus and points at the
 * highlighted option through `aria-activedescendant`, so options are never
 * focused directly.
 *
 * Written generically (options + groups + hints + a footer slot) so the other
 * `<select>`s in the editor — file-list sort, wizard parent, the recurrence
 * dropdowns — can adopt it without a rewrite. Only the header uses it so far.
 */

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface PickerOption {
  value: string;
  label: string;
  /** Heading this option sits under, e.g. a branch folder like `theme`. */
  group?: string;
  /** Muted second line. */
  hint?: string;
}

export function Picker({
  value,
  options,
  onChange,
  label,
  placeholder = "Filter…",
  footer,
  className = "",
}: {
  value: string;
  options: PickerOption[];
  onChange: (value: string) => void;
  /** Accessible name for the control — e.g. "Branch". */
  label: string;
  placeholder?: string;
  /** Actions rendered under the list, e.g. "Browse all branches…". */
  footer?: (close: () => void) => ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const current = options.find((o) => o.value === value);

  /** Filtered options, flat — the index here is what `active` refers to. */
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(q) || o.label.toLowerCase().includes(q),
    );
  }, [options, query]);

  /** Same list again, chunked into its groups for rendering. */
  const sections = useMemo(() => {
    const out: { group: string; items: { opt: PickerOption; i: number }[] }[] =
      [];
    shown.forEach((opt, i) => {
      const group = opt.group ?? "";
      const last = out[out.length - 1];
      if (last && last.group === group) last.items.push({ opt, i });
      else out.push({ group, items: [{ opt, i }] });
    });
    return out;
  }, [shown]);

  function close() {
    setOpen(false);
    setQuery("");
  }

  // Opening starts from a clean filter, with the current value highlighted.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    inputRef.current?.focus();
  }, [open, options, value]);

  // A filter that scrolls the highlight off-screen is worse than none.
  useEffect(() => {
    if (!open) return;
    document
      .getElementById(optionId(active))
      ?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, shown.length]);

  // Light dismiss. Pointerdown (not click) so it fires before focus moves.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    close();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const opt = shown[active];
      if (opt) choose(opt.value);
      return;
    }
    const move =
      e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowUp"
          ? -1
          : e.key === "Home"
            ? -Infinity
            : e.key === "End"
              ? Infinity
              : 0;
    if (!move || !shown.length) return;
    e.preventDefault();
    setActive((a) =>
      Math.max(
        0,
        Math.min(
          shown.length - 1,
          move === Infinity ? shown.length - 1 : a + move,
        ),
      ),
    );
  }

  return (
    <div className={`pick ${className}`} ref={wrapRef}>
      <button
        type="button"
        className="pick__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span className="pick__label">{label}</span>
        <span className="pick__value">{current?.label ?? value}</span>
        <span className="pick__caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="pick__pop" role="dialog" aria-label={label}>
          <input
            ref={inputRef}
            className="pick__filter"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-label={`Filter ${label.toLowerCase()}`}
            aria-activedescendant={shown.length ? optionId(active) : undefined}
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />

          <div
            className="pick__list"
            role="listbox"
            id={listId}
            aria-label={label}
          >
            {!shown.length && <p className="pick__none">No match.</p>}
            {sections.map((s) => (
              <div
                key={s.group || "-"}
                role="group"
                aria-label={s.group || undefined}
              >
                {s.group && (
                  <div className="pick__grouphead" aria-hidden="true">
                    {s.group}/
                  </div>
                )}
                {s.items.map(({ opt, i }) => (
                  <div
                    key={opt.value}
                    id={optionId(i)}
                    role="option"
                    aria-selected={opt.value === value}
                    className={`pick__opt${i === active ? " is-active" : ""}${
                      opt.value === value ? " is-current" : ""
                    }`}
                    // Keep focus in the filter input so the combobox keeps working.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(opt.value)}
                  >
                    <span className="pick__opttext">{opt.label}</span>
                    {opt.hint && <span className="pick__hint">{opt.hint}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {footer && <div className="pick__footer">{footer(close)}</div>}
        </div>
      )}
    </div>
  );
}
