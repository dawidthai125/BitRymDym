import { buildVoiceWorkletSource } from "@/lib/studio/mix-analysis/voice-worklet";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  return new Response(buildVoiceWorkletSource(), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
