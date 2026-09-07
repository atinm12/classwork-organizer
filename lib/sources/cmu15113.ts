import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { fetchWithTimeout } from "../fetchWithTimeout";
import { parseSlashDate } from "../dates";
import {
  ClassworkItem,
  FETCH_URL_15113,
  SCHEDULE_URL_15113,
} from "../types";

const COURSE = "15-113";

function clean(text: string): string {
  return text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse the 15-113 schedule table's Assignments column. This course has no
 * tests, so everything is tagged "assignment". Only entries with a parseable
 * due date are emitted (avoids dateless "Start Project X" duplicates).
 *
 * NOTE: future weeks on this page are HTML-commented-out; cheerio ignores
 * comments, so only currently-live rows are parsed. We do not assume a fixed
 * column order — the Assignments column is located from the header.
 */
export function parse15113(html: string): ClassworkItem[] {
  const $ = cheerio.load(html);

  // Find the schedule table: the one whose header includes an "Assignments" column.
  let table: cheerio.Cheerio<AnyNode> | null = null;
  let assignCol = -1;
  $("table").each((_, t) => {
    if (table) return;
    const headers = $(t).find("tr").first().find("th, td");
    headers.each((i, h) => {
      if (/assignment/i.test($(h).text())) {
        table = $(t);
        assignCol = i;
      }
    });
  });

  if (!table || assignCol < 0) {
    throw new Error(
      "15-113 schedule table / Assignments column not found (page structure changed)"
    );
  }

  const items: ClassworkItem[] = [];
  let rowIdx = 0;

  (table as cheerio.Cheerio<AnyNode>).find("tr").each((_, tr) => {
    const cells = $(tr).find("> td");
    if (cells.length === 0) return; // header row
    // Skip phase-header banner rows that span the whole table.
    if (cells.eq(0).attr("colspan")) return;
    if (cells.length <= assignCol) return;

    const cell = cells.eq(assignCol);

    // Convert <br> to newlines so each label / due line is separable.
    cell.find("br").replaceWith("\n");
    const cellText = cell.text();
    const firstHref = cell.find("a[href]").first().attr("href");
    const url = firstHref
      ? new URL(firstHref, FETCH_URL_15113).toString()
      : SCHEDULE_URL_15113;

    rowIdx += 1;

    const lines = cellText
      .split("\n")
      .map(clean)
      .filter(Boolean);

    let titleParts: string[] = [];
    let entryIdx = 0;

    for (const line of lines) {
      const dueIdx = line.search(/\(due/i);
      if (dueIdx === -1) {
        titleParts.push(line);
        continue;
      }
      const before = line.slice(0, dueIdx).trim();
      if (before) titleParts.push(before);

      const iso = parseSlashDate(line.slice(dueIdx));
      const title = clean(titleParts.join(" ")) || "Assignment";
      entryIdx += 1;

      if (iso) {
        items.push({
          id: `15113-${rowIdx}-${entryIdx}`,
          course: COURSE,
          title: title.replace(/[:\s]+$/, ""),
          dueDate: iso,
          type: "assignment",
          points: null,
          url,
          status: null,
          source: "15-113",
        });
      }
      titleParts = [];
    }
  });

  return items;
}

/** Fetch the live 15-113 page and parse it. */
export async function fetch15113(): Promise<ClassworkItem[]> {
  const res = await fetchWithTimeout(FETCH_URL_15113);
  if (!res.ok) {
    throw new Error(`15-113 page returned ${res.status} ${res.statusText}`);
  }
  return parse15113(await res.text());
}
