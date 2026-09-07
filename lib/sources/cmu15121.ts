import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { easternIso, parseMonthDay, parseSlashDate } from "../dates";
import { ClassworkItem, SCHEDULE_URL_15121 } from "../types";

const TEST_KEYWORDS = /(QUIZ|WRITTEN EXAM|FINAL EXAM)/i;
const COURSE = "15-121";

/** Collapse whitespace and strip a trailing "due" if the deliverable text has one. */
function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse the 15-121 schedule HTML. Tests come from the LECTURES/LABS column
 * (QUIZ / WRITTEN EXAM / FINAL EXAM), assignments from the DELIVERABLES column.
 * Pure function (no network) so it can be tested against saved HTML.
 */
export function parse15121(html: string): ClassworkItem[] {
  const $ = cheerio.load(html);

  const table = $("table.table-striped").first();
  if (table.length === 0) {
    throw new Error("15-121 schedule table not found (page structure changed)");
  }

  const items: ClassworkItem[] = [];
  let rowIdx = 0;

  table.find("tbody > tr").each((_, tr) => {
    const cells = $(tr).find("> td");
    if (cells.length < 4) return; // spacer / malformed rows

    const dateText = clean(cells.eq(0).text());
    const lectureText = clean(cells.eq(1).text());
    const deliverableText = clean(cells.eq(3).text());
    if (!dateText && !lectureText && !deliverableText) return;

    rowIdx += 1;

    // Resolve the class date for this row (null when "TBA" or unparseable).
    const isTba = /TBA/i.test(dateText);
    const md = isTba ? null : parseMonthDay(dateText);
    const classDateIso = md ? easternIso(md.month, md.day, 23, 59) : null;

    // --- Test? (LECTURES/LABS column) ---
    if (TEST_KEYWORDS.test(lectureText)) {
      // Capture the exam name plus an optional "(...)" qualifier, without the
      // trailing policy/lecture prose that shares the same table cell.
      const title = clean(
        lectureText.match(
          /(QUIZ\s*\d*|WRITTEN EXAM\s*\d*\s*(?:\([^)]*\))?|FINAL EXAM\s*(?:\([^)]*\))?)/i
        )?.[1] ?? lectureText
      );
      items.push({
        id: `15121-test-${rowIdx}`,
        course: COURSE,
        title: clean(title),
        dueDate: classDateIso,
        dueLabel: classDateIso ? undefined : "TBA",
        type: "test",
        points: null,
        url: SCHEDULE_URL_15121,
        status: null,
        source: "15-121",
      });
    }

    // --- Assignment? (DELIVERABLES column) ---
    if (deliverableText && deliverableText !== "-") {
      // An inline override like "due TUE 9/8" wins over the class date.
      const override = parseSlashDate(deliverableText);
      items.push({
        id: `15121-deliv-${rowIdx}`,
        course: COURSE,
        title: deliverableText,
        dueDate: override ?? classDateIso,
        dueLabel: override || classDateIso ? undefined : "TBA",
        type: "assignment",
        points: null,
        url: SCHEDULE_URL_15121,
        status: null,
        source: "15-121",
      });
    }
  });

  return items;
}

/** Fetch the live 15-121 schedule page and parse it. */
export async function fetch15121(): Promise<ClassworkItem[]> {
  const res = await fetchWithTimeout(SCHEDULE_URL_15121);
  if (!res.ok) {
    throw new Error(`15-121 schedule returned ${res.status} ${res.statusText}`);
  }
  return parse15121(await res.text());
}
