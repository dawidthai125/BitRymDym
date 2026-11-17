import { buildGateWorkletSource } from "@/lib/studio/mix-analysis/gate-worklet";

export const runtime = "nodejs";
export const dynamic = "force-static";

/** AudioWorklet module for Stage 2 gate (same-origin, public DSP, no data). */
export function GET() {
  return new Response(buildGateWorkletSource(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
