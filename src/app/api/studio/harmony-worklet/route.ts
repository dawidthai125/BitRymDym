import { buildHarmonyWorkletSource } from "@/lib/studio/mix-analysis/harmony-worklet";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return new Response(buildHarmonyWorkletSource(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
