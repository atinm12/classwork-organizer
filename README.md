# Classwork Organizer

A live dashboard of upcoming **assignments** and **tests**, pulled fresh on every page
load from three sources:

1. **Canvas** — via the Canvas REST API (your personal access token).
2. **15-121** — the [course schedule page](https://www.cs.cmu.edu/~15121/schedule.html)
   (quizzes, written exams, final exam, and deliverables).
3. **15-113** — the [course page](https://www.cs.cmu.edu/~113/#schedule) (homework and
   projects; this course has no tests).

Each source is fetched independently with its own timeout and error handling, so if one
source is down or its page structure changes, the others still render (you'll see an inline
"Couldn't load … right now" notice for the broken one). There is no database, cache, or
background refresh — every load fetches live.

**Interface:** toggle between Assignments and Tests, filter by time window (default: last 10
days & upcoming), and sort by due date / course / points. Overdue items (past due and not yet
submitted/graded) are flagged. A **Mark done** button on each item is saved in your browser
(`localStorage`) — it's per-browser and per-device, not synced, since there's no backend.

## Tech

Next.js (App Router) + TypeScript. Scraping via `cheerio`. Backend is a single Next.js API
route (`app/api/classwork/route.ts`) that runs all three source modules
(`lib/sources/*.ts`) in parallel and returns a shared item shape (`lib/types.ts`).

## Getting a Canvas API token

1. Log in to Canvas (e.g. https://canvas.cmu.edu).
2. Go to **Account → Settings**.
3. Under **Approved Integrations**, click **+ New Access Token**.
4. Give it a purpose (e.g. "Classwork Organizer") and generate it.
5. Copy the token immediately — Canvas only shows it once.

## Environment variables

| Variable           | Required | Default                    | Notes                              |
| ------------------ | -------- | -------------------------- | ---------------------------------- |
| `CANVAS_API_TOKEN` | yes      | —                          | Your Canvas personal access token. |
| `CANVAS_BASE_URL`  | no       | `https://canvas.cmu.edu`   | Your Canvas instance base URL.     |
| `FETCH_TIMEOUT_MS` | no       | `10000`                    | Per-source fetch timeout (ms).     |

See [`.env.example`](.env.example). **Never commit your token** — `.env.local` is gitignored.

## Local development

```bash
npm install
cp .env.example .env.local   # then paste your token into .env.local
npm run dev
```

Open http://localhost:3000. The page calls `/api/classwork`, which fetches all three sources
live. You can inspect the raw payload at http://localhost:3000/api/classwork.

## Deploy to Vercel

1. Push this repo to GitHub.
2. In the [Vercel dashboard](https://vercel.com/new), **Import** the repo (framework
   auto-detects as Next.js).
3. Under **Settings → Environment Variables**, add `CANVAS_API_TOKEN` (and optionally
   `CANVAS_BASE_URL`) for the Production environment.
4. Deploy. The resulting URL is public — no login gate.

Or via the CLI:

```bash
npm i -g vercel
vercel login
vercel link
vercel env add CANVAS_API_TOKEN production
vercel deploy --prod
```

## How each source is classified

- **Canvas:** an item is a **test** if its `submission_types` includes `online_quiz`, or the
  assignment is quiz-backed (`is_quiz_assignment` / `quiz_id`); otherwise an **assignment**.
  Points, due date, submission status (submitted / missing / graded), and a link back are
  included when the API exposes them.
- **15-121:** **tests** come from the `LECTURES/LABS` column (`QUIZ`, `WRITTEN EXAM`,
  `FINAL EXAM`); **assignments** from the `DELIVERABLES` column. The final exam is listed as
  `TBA` and appears under a separate **Date TBA** section.
- **15-113:** everything in the `Assignments` column is an **assignment**. Future weeks are
  HTML-commented-out on the source page and are intentionally not shown until the instructor
  uncomments them.

## Robustness

Scraping the two CMU pages is inherently fragile. The parsers fail safely: if a page's
structure changes, that source reports a clear error and the other two keep working. Each
fetch has a timeout so a slow source can't hang the page.
