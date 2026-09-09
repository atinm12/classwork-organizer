"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { easternIso } from "@/lib/dates";
import type {
  ClassworkItem,
  ClassworkResponse,
  ItemType,
  SourceId,
} from "@/lib/types";

const SOURCE_LABELS: Record<SourceId, string> = {
  canvas: "Canvas",
  "15-121": "15-121",
  "15-113": "15-113",
  custom: "Custom",
};

type SortKey =
  | "due-asc"
  | "due-desc"
  | "course-asc"
  | "points-desc"
  | "points-asc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "due-asc", label: "Due date — earliest first" },
  { key: "due-desc", label: "Due date — latest first" },
  { key: "course-asc", label: "Course — A to Z" },
  { key: "points-desc", label: "Points — high to low" },
  { key: "points-asc", label: "Points — low to high" },
];

/** How many days of past-due items the "recent" window looks back. */
const LOOKBACK_DAYS = 10;

type RangeKey = "recent" | "upcoming" | "all";

const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "recent", label: `Last ${LOOKBACK_DAYS} days & upcoming` },
  { key: "upcoming", label: "Upcoming only" },
  { key: "all", label: "All dates" },
];

/** Keep dated items within the selected time window. */
function inRange(iso: string, range: RangeKey, now: number): boolean {
  if (range === "all") return true;
  const due = new Date(iso).getTime();
  if (Number.isNaN(due)) return true; // don't drop unparseable dates
  if (range === "upcoming") return due >= now;
  return due >= now - LOOKBACK_DAYS * 86_400_000; // "recent"
}

/** Past-due and still outstanding (not already submitted/graded on Canvas). */
function isOverdue(item: ClassworkItem, now: number): boolean {
  if (!item.dueDate) return false;
  if (new Date(item.dueDate).getTime() >= now) return false;
  return !/submitted|graded/i.test(item.status ?? "");
}

// --- "Mark as done" persistence (per-viewer, browser localStorage) ----------

const DONE_STORAGE_KEY = "classwork-done-v1";

function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(DONE_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

function saveDone(ids: Set<string>): void {
  try {
    localStorage.setItem(DONE_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Private mode / storage disabled — done state is best-effort only.
  }
}

// --- Custom (user-added) items, persisted per-viewer in localStorage --------

const CUSTOM_STORAGE_KEY = "classwork-custom-v1";

function loadCustom(): ClassworkItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as ClassworkItem[]) : [];
  } catch {
    return [];
  }
}

function saveCustom(items: ClassworkItem[]): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private mode / storage disabled — custom items are best-effort only.
  }
}

/**
 * Convert a datetime-local value ("YYYY-MM-DDTHH:mm", or "YYYY-MM-DD" for a
 * date with no time) into an Eastern-time ISO string. Returns null if empty.
 * Times are interpreted as US Eastern to match the fetched sources.
 */
function customDueToIso(value: string): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  return easternIso(
    Number(mo),
    Number(d),
    hh ? Number(hh) : 23,
    mm ? Number(mm) : 59,
    Number(y)
  );
}

/**
 * Comparators for the dated list. Items with no due date are handled separately
 * (the TBA section), so every item here has a non-null dueDate. Points can be
 * null (CMU sources) — those sort to the end regardless of direction.
 */
function makeComparator(sort: SortKey) {
  const byDueAsc = (a: ClassworkItem, b: ClassworkItem) =>
    a.dueDate!.localeCompare(b.dueDate!);

  switch (sort) {
    case "due-desc":
      return (a: ClassworkItem, b: ClassworkItem) => byDueAsc(b, a);
    case "course-asc":
      return (a: ClassworkItem, b: ClassworkItem) =>
        a.course.localeCompare(b.course) || byDueAsc(a, b);
    case "points-desc":
      return (a: ClassworkItem, b: ClassworkItem) => {
        if (a.points == null && b.points == null) return byDueAsc(a, b);
        if (a.points == null) return 1;
        if (b.points == null) return -1;
        return b.points - a.points || byDueAsc(a, b);
      };
    case "points-asc":
      return (a: ClassworkItem, b: ClassworkItem) => {
        if (a.points == null && b.points == null) return byDueAsc(a, b);
        if (a.points == null) return 1;
        if (b.points == null) return -1;
        return a.points - b.points || byDueAsc(a, b);
      };
    case "due-asc":
    default:
      return byDueAsc;
  }
}

function formatDue(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatToday(now: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(now));
}

/**
 * Index in the (chronologically sorted) dated list where a "today" divider
 * belongs — the boundary between past-due and upcoming items. Returns -1 for
 * non-chronological sorts, where a today marker wouldn't be meaningful.
 */
function todayDividerIndex(
  dated: ClassworkItem[],
  sort: SortKey,
  now: number
): number {
  if (sort === "due-asc") {
    const i = dated.findIndex((it) => new Date(it.dueDate!).getTime() >= now);
    return i === -1 ? dated.length : i; // all past → divider at the very end
  }
  if (sort === "due-desc") {
    const i = dated.findIndex((it) => new Date(it.dueDate!).getTime() < now);
    return i === -1 ? dated.length : i; // all upcoming → divider at the end
  }
  return -1;
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("miss")) return "badge badge-missing";
  if (s.includes("graded")) return "badge badge-graded";
  if (s.includes("submitted")) return "badge badge-submitted";
  return "badge badge-neutral";
}

function ItemCard({
  item,
  now,
  done,
  onToggleDone,
  onDelete,
}: {
  item: ClassworkItem;
  now: number;
  done: boolean;
  onToggleDone: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const overdue = !done && isOverdue(item, now);
  const cls = ["card", overdue && "overdue", done && "done"]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={cls}>
      <div className="card-main">
        <div className="card-title">
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer">
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </div>
        <div className="card-meta">
          <span className={`badge badge-source badge-${item.source}`}>
            {SOURCE_LABELS[item.source]}
          </span>
          <span className="course">{item.course}</span>
          {item.points != null && (
            <span className="points">{item.points} pts</span>
          )}
          {done && <span className="badge badge-done">done</span>}
          {overdue && <span className="badge badge-overdue">overdue</span>}
          {item.status && (
            <span className={statusClass(item.status)}>{item.status}</span>
          )}
        </div>
      </div>
      <div className="card-side">
        <div className="card-due">
          {item.dueDate ? (
            formatDue(item.dueDate)
          ) : (
            <span className="tba">{item.dueLabel ?? "TBA"}</span>
          )}
        </div>
        <div className="card-buttons">
          <button
            className="done-btn"
            onClick={() => onToggleDone(item.id)}
            aria-pressed={done}
          >
            {done ? "Undo" : "Mark done"}
          </button>
          {onDelete && (
            <button
              className="delete-btn"
              onClick={() => onDelete(item.id)}
              aria-label={`Delete ${item.title}`}
              title="Delete"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

export default function Home() {
  const [data, setData] = useState<ClassworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<ItemType>("assignment");
  const [sort, setSort] = useState<SortKey>("due-asc");
  const [range, setRange] = useState<RangeKey>("recent");
  const [done, setDone] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState<ClassworkItem[]>([]);

  // Form state for adding a custom assignment.
  const [showForm, setShowForm] = useState(false);
  const [fTitle, setFTitle] = useState("");
  const [fCourse, setFCourse] = useState("");
  const [fType, setFType] = useState<ItemType>("assignment");
  const [fDue, setFDue] = useState("");

  // Load persisted "done" ids and custom items once, on the client.
  useEffect(() => {
    setDone(loadDone());
    setCustom(loadCustom());
  }, []);

  const toggleDone = (id: string) => {
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveDone(next);
      return next;
    });
  };

  const addCustom = () => {
    const title = fTitle.trim();
    if (!title) return;
    const item: ClassworkItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      course: fCourse.trim() || "Custom",
      title,
      dueDate: customDueToIso(fDue),
      type: fType,
      points: null,
      url: null,
      status: null,
      source: "custom",
    };
    setCustom((prev) => {
      const next = [...prev, item];
      saveCustom(next);
      return next;
    });
    // Reset the form and keep it open for quick multi-entry.
    setFTitle("");
    setFCourse("");
    setFDue("");
    setFType("assignment");
  };

  const deleteCustom = (id: string) => {
    setCustom((prev) => {
      const next = prev.filter((i) => i.id !== id);
      saveCustom(next);
      return next;
    });
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/classwork", { cache: "no-store" });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const json = (await res.json()) as ClassworkResponse;
        if (active) setData(json);
      } catch (err) {
        if (active)
          setFetchError(err instanceof Error ? err.message : String(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const now = data ? Date.now() : 0;

  const { dated, tba, dividerIndex } = useMemo(() => {
    const all = [...(data?.items ?? []), ...custom];
    const items = all.filter((i) => i.type === view);
    const dated = items
      .filter((i) => i.dueDate && inRange(i.dueDate, range, now))
      .sort(makeComparator(sort));
    const tba = items
      .filter((i) => !i.dueDate)
      .sort((a, b) => a.course.localeCompare(b.course));
    const dividerIndex = todayDividerIndex(dated, sort, now);
    return { dated, tba, dividerIndex };
  }, [data, custom, view, sort, range, now]);

  const sourceErrors = data
    ? (Object.entries(data.errors) as [SourceId, string | null][]).filter(
        ([, msg]) => msg
      )
    : [];

  return (
    <main className="container">
      <header className="site-header">
        <h1>Classwork Organizer</h1>
        {data && (
          <p className="subtitle">
            Live from Canvas, 15-121 &amp; 15-113 · fetched{" "}
            {new Intl.DateTimeFormat("en-US", {
              timeZone: "America/New_York",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(data.fetchedAt))}{" "}
            ET
          </p>
        )}
      </header>

      <div className="controls">
        <nav className="tabs">
          <button
            className={view === "assignment" ? "tab active" : "tab"}
            onClick={() => setView("assignment")}
          >
            Assignments
          </button>
          <button
            className={view === "test" ? "tab active" : "tab"}
            onClick={() => setView("test")}
          >
            Tests
          </button>
        </nav>

        <div className="selectors">
          <label className="control">
            <span className="control-label">Show</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="control">
            <span className="control-label">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <button
            className="add-btn"
            onClick={() => setShowForm((v) => !v)}
            aria-expanded={showForm}
          >
            {showForm ? "Close" : "+ Add"}
          </button>
        </div>
      </div>

      {showForm && (
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            addCustom();
          }}
        >
          <div className="field field-grow">
            <label htmlFor="f-title">Title</label>
            <input
              id="f-title"
              type="text"
              value={fTitle}
              onChange={(e) => setFTitle(e.target.value)}
              placeholder="e.g. Read chapter 4"
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="f-course">Course</label>
            <input
              id="f-course"
              type="text"
              value={fCourse}
              onChange={(e) => setFCourse(e.target.value)}
              placeholder="optional"
            />
          </div>
          <div className="field">
            <label htmlFor="f-type">Type</label>
            <select
              id="f-type"
              value={fType}
              onChange={(e) => setFType(e.target.value as ItemType)}
            >
              <option value="assignment">Assignment</option>
              <option value="test">Test</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-due">Due (ET)</label>
            <input
              id="f-due"
              type="datetime-local"
              value={fDue}
              onChange={(e) => setFDue(e.target.value)}
            />
          </div>
          <button type="submit" className="add-submit" disabled={!fTitle.trim()}>
            Add
          </button>
        </form>
      )}

      {sourceErrors.length > 0 && (
        <div className="notices">
          {sourceErrors.map(([source, msg]) => (
            <div key={source} className="notice">
              Couldn&apos;t load {SOURCE_LABELS[source]} right now.
              <span className="notice-detail"> {msg}</span>
            </div>
          ))}
        </div>
      )}

      {loading && <p className="state">Loading live classwork…</p>}
      {fetchError && !loading && (
        <p className="state error">Failed to load: {fetchError}</p>
      )}

      {!loading && !fetchError && (
        <>
          {dated.length === 0 && tba.length === 0 ? (
            <p className="state">
              No {view === "assignment" ? "assignments" : "tests"} found.
            </p>
          ) : (
            <ul className="list">
              {dated.map((item, i) => (
                <Fragment key={item.id}>
                  {i === dividerIndex && (
                    <li className="today-divider" aria-hidden="true">
                      <span>Today · {formatToday(now)}</span>
                    </li>
                  )}
                  <ItemCard
                    item={item}
                    now={now}
                    done={done.has(item.id)}
                    onToggleDone={toggleDone}
                    onDelete={item.source === "custom" ? deleteCustom : undefined}
                  />
                </Fragment>
              ))}
              {dividerIndex === dated.length && dated.length > 0 && (
                <li className="today-divider" aria-hidden="true">
                  <span>Today · {formatToday(now)}</span>
                </li>
              )}
            </ul>
          )}

          {tba.length > 0 && (
            <section className="tba-section">
              <h2>Date TBA</h2>
              <ul className="list">
                {tba.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    now={now}
                    done={done.has(item.id)}
                    onToggleDone={toggleDone}
                    onDelete={item.source === "custom" ? deleteCustom : undefined}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
