import { buildRiderWorkletSource } from "@/lib/studio/mix-analysis/rider-worklet";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** AudioWorklet module for the vocal rider (same-origin, public DSP, no data). */
export function GET() {
  return new Response(buildRiderWorkletSource(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
