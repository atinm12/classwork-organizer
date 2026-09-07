import { NextResponse } from "next/server";
import { fetchCanvas } from "@/lib/sources/canvas";
import { fetch15121 } from "@/lib/sources/cmu15121";
import { fetch15113 } from "@/lib/sources/cmu15113";
import { ClassworkItem, ClassworkResponse, SourceErrors } from "@/lib/types";

// Always fetch live; never cache this route.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function errMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

export async function GET() {
  const [canvas, c15121, c15113] = await Promise.allSettled([
    fetchCanvas(),
    fetch15121(),
    fetch15113(),
  ]);

  const items: ClassworkItem[] = [];
  const errors: SourceErrors = {
    canvas: null,
    "15-121": null,
    "15-113": null,
  };

  if (canvas.status === "fulfilled") items.push(...canvas.value);
  else errors.canvas = errMessage(canvas.reason);

  if (c15121.status === "fulfilled") items.push(...c15121.value);
  else errors["15-121"] = errMessage(c15121.reason);

  if (c15113.status === "fulfilled") items.push(...c15113.value);
  else errors["15-113"] = errMessage(c15113.reason);

  const body: ClassworkResponse = {
    items,
    errors,
    fetchedAt: new Date().toISOString(),
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}
