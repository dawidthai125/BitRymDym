import { buildPocketWorkletSource } from "@/lib/studio/mix-analysis/pocket-worklet";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** AudioWorklet module for the rap pocket (same-origin, public DSP, no data). */
export function GET() {
  return new Response(buildPocketWorkletSource(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
