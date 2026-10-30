import { buildTuneWorkletSource } from "@/lib/studio/tune/tune-worklet";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** AudioWorklet module for BRD Tune (same-origin, public DSP code, no data). */
export function GET() {
  return new Response(buildTuneWorkletSource(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
