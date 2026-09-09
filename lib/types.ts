export type SourceId = "canvas" | "15-121" | "15-113" | "custom";

export type ItemType = "assignment" | "test";

/**
 * The shared output shape every source module produces. Sources can be added,
 * removed, or fixed independently as long as they emit this shape.
 */
export interface ClassworkItem {
  /** Stable-ish id for React keys and de-duping. */
  id: string;
  /** Human-readable course name. */
  course: string;
  /** Assignment / test title. */
  title: string;
  /** ISO 8601 string, or null when there is no confirmed date (e.g. "TBA"). */
  dueDate: string | null;
  /** Raw label to show when dueDate is null (e.g. "TBA"). */
  dueLabel?: string;
  type: ItemType;
  /** Points possible, when known. */
  points: number | null;
  /** Link back to the source (assignment page, schedule page, etc.). */
  url: string | null;
  /** Submission status when available (Canvas only): submitted/missing/graded/unsubmitted. */
  status: string | null;
  source: SourceId;
}

/** Per-source error strings; null means that source succeeded. */
export interface SourceErrors {
  canvas: string | null;
  "15-121": string | null;
  "15-113": string | null;
}

export interface ClassworkResponse {
  items: ClassworkItem[];
  errors: SourceErrors;
  fetchedAt: string;
}

// ---- Config constants -------------------------------------------------------

/**
 * The academic year these CMU schedule pages describe. Both pages cover the
 * Fall 2026 term and list dates without a year, so we stamp this in. Bump when
 * the courses roll to a new term.
 */
export const SEMESTER_YEAR = 2026;

export const CANVAS_BASE_URL =
  process.env.CANVAS_BASE_URL?.replace(/\/+$/, "") || "https://canvas.cmu.edu";

export const SCHEDULE_URL_15121 = "https://www.cs.cmu.edu/~15121/schedule.html";
export const SCHEDULE_URL_15113 = "https://www.cs.cmu.edu/~113/#schedule";
/** Fetch target for 15-113 (the fragment is only meaningful in a browser). */
export const FETCH_URL_15113 = "https://www.cs.cmu.edu/~113/";

/** Per-source fetch timeout in ms. */
export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 10000;
