import "server-only";

/**
 * Dynamic Open Graph / Twitter card (1200×630): beat cover (when publicly visible) + title.
 * Covers are WebP in storage; satori cannot decode WebP, so they are converted to PNG here.
 */
import { ImageResponse } from "next/og";
import sharp from "sharp";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export async function coverDataUrl(bytes: Uint8Array | null | undefined): Promise<string | null> {
  if (!bytes?.length) return null;
  try {
    const png = await sharp(bytes).resize(520, 520, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export function shareCard(p: { title: string; kicker: string; meta?: string | null; cover: string | null }) {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: 56, background: "#16130f", color: "#f3ebdd" }}>
        {p.cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img>
          <img src={p.cover} width={520} height={520} alt="" style={{ borderRadius: 4, border: "2px solid #d39b3a", objectFit: "cover" }} />
        ) : (
          <div style={{ width: 520, height: 520, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4, border: "2px solid #d39b3a", background: "#231e17", fontSize: 140, color: "#d39b3a" }}>♪</div>
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#d39b3a" }}>{p.kicker}</div>
          <div style={{ fontSize: p.title.length > 40 ? 52 : 68, lineHeight: 1.08, fontWeight: 700 }}>{p.title}</div>
          {p.meta ? <div style={{ fontSize: 30, color: "#b9ad99" }}>{p.meta}</div> : null}
          <div style={{ marginTop: 24, fontSize: 30, fontWeight: 700 }}>BitRymDym</div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
