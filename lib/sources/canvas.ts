import { fetchWithTimeout } from "../fetchWithTimeout";
import { CANVAS_BASE_URL, ClassworkItem } from "../types";

interface CanvasCourse {
  id: number;
  name?: string;
  course_code?: string;
}

interface CanvasSubmission {
  workflow_state?: string; // unsubmitted | submitted | graded | pending_review
  missing?: boolean;
  late?: boolean;
  submitted_at?: string | null;
}

interface CanvasAssignment {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url: string;
  submission_types?: string[];
  is_quiz_assignment?: boolean;
  quiz_id?: number | null;
  submission?: CanvasSubmission;
}

const PAGE_CAP = 10; // safety cap on pagination per request

/** Parse the RFC-5988 Link header and return the rel="next" URL, if any. */
function nextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function canvasGetAll<T>(path: string, token: string): Promise<T[]> {
  let url: string | null = path.startsWith("http")
    ? path
    : `${CANVAS_BASE_URL}/api/v1${path}`;
  const out: T[] = [];
  let pages = 0;

  while (url && pages < PAGE_CAP) {
    const res: Response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Canvas API ${res.status} ${res.statusText}${
          body ? `: ${body.slice(0, 200)}` : ""
        }`
      );
    }
    const page = (await res.json()) as T[];
    if (Array.isArray(page)) out.push(...page);
    url = nextLink(res.headers.get("link"));
    pages += 1;
  }
  return out;
}

function classifyType(a: CanvasAssignment): "assignment" | "test" {
  const isQuiz =
    (a.submission_types?.includes("online_quiz") ?? false) ||
    a.is_quiz_assignment === true ||
    (a.quiz_id != null && a.quiz_id !== 0);
  return isQuiz ? "test" : "assignment";
}

function deriveStatus(s?: CanvasSubmission): string | null {
  if (!s) return null;
  if (s.missing) return "missing";
  if (s.workflow_state === "graded") return "graded";
  if (s.workflow_state === "pending_review") return "pending review";
  if (s.workflow_state === "submitted" || s.submitted_at) {
    return s.late ? "submitted (late)" : "submitted";
  }
  if (s.workflow_state === "unsubmitted") return "not submitted";
  return s.workflow_state ?? null;
}

/**
 * Fetch assignments and quizzes across the user's active Canvas courses.
 * Throws on auth/config failure so the aggregator can surface a clear notice.
 */
export async function fetchCanvas(): Promise<ClassworkItem[]> {
  const token = process.env.CANVAS_API_TOKEN;
  if (!token) {
    throw new Error(
      "CANVAS_API_TOKEN is not set. Add it to .env.local (local) or Vercel env (prod)."
    );
  }

  const courses = await canvasGetAll<CanvasCourse>(
    "/courses?enrollment_state=active&per_page=100",
    token
  );

  const perCourse = await Promise.allSettled(
    courses.map(async (course) => {
      const assignments = await canvasGetAll<CanvasAssignment>(
        `/courses/${course.id}/assignments?per_page=100&include[]=submission`,
        token
      );
      const courseName =
        course.name || course.course_code || `Course ${course.id}`;
      return assignments.map<ClassworkItem>((a) => ({
        id: `canvas-${course.id}-${a.id}`,
        course: courseName,
        title: a.name,
        dueDate: a.due_at ?? null,
        dueLabel: a.due_at ? undefined : "No due date",
        type: classifyType(a),
        points: a.points_possible ?? null,
        url: a.html_url ?? null,
        status: deriveStatus(a.submission),
        source: "canvas",
      }));
    })
  );

  const items: ClassworkItem[] = [];
  for (const result of perCourse) {
    if (result.status === "fulfilled") items.push(...result.value);
    // A single failing course is tolerated; the rest still contribute.
  }
  return items;
}
