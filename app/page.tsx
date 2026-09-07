"use client";

import { useEffect, useMemo, useState } from "react";
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
};

function formatDue(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("miss")) return "badge badge-missing";
  if (s.includes("graded")) return "badge badge-graded";
  if (s.includes("submitted")) return "badge badge-submitted";
  return "badge badge-neutral";
}

function ItemCard({ item }: { item: ClassworkItem }) {
  return (
    <li className="card">
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
          {item.status && (
            <span className={statusClass(item.status)}>{item.status}</span>
          )}
        </div>
      </div>
      <div className="card-due">
        {item.dueDate ? (
          formatDue(item.dueDate)
        ) : (
          <span className="tba">{item.dueLabel ?? "TBA"}</span>
        )}
      </div>
    </li>
  );
}

export default function Home() {
  const [data, setData] = useState<ClassworkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [view, setView] = useState<ItemType>("assignment");

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

  const { dated, tba } = useMemo(() => {
    const items = (data?.items ?? []).filter((i) => i.type === view);
    const dated = items
      .filter((i) => i.dueDate)
      .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!));
    const tba = items.filter((i) => !i.dueDate);
    return { dated, tba };
  }, [data, view]);

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
              {dated.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </ul>
          )}

          {tba.length > 0 && (
            <section className="tba-section">
              <h2>Date TBA</h2>
              <ul className="list">
                {tba.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  );
}
