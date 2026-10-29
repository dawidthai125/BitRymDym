/**
 * Node host: bundle OAC entry with esbuild and render via Playwright Chromium.
 * Local-only Stage I.13b — no network / Supabase.
 */

import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import type {
  OacRenderRequest,
  OacRenderResponse,
} from "@/lib/studio/studio-fx-parity-oac-entry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "studio-fx-parity-oac-entry.ts");
const SRC_ROOT = path.resolve(HERE, "../..");

let bundleCache: string | null = null;
let browserPromise: ReturnType<typeof chromium.launch> | null = null;

export function f32ToB64(f32: Float32Array): string {
  return Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString(
    "base64",
  );
}

export function b64ToF32(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  return new Float32Array(
    buf.buffer,
    buf.byteOffset,
    Math.floor(buf.byteLength / 4),
  );
}

export async function getOacBundle(): Promise<string> {
  if (bundleCache) return bundleCache;
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    sourcemap: false,
    logLevel: "silent",
    alias: {
      "@": SRC_ROOT,
    },
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error("esbuild produced empty OAC bundle");
  bundleCache = text;
  return text;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ["--disable-gpu", "--no-sandbox"],
    });
  }
  return browserPromise;
}

export async function closeOacHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

export async function renderViaOfflineAudioContext(params: {
  sampleRate: number;
  sourcePcm: Float32Array;
  sourceFrames: number;
  document: StudioEngineDocument;
  exportDurationMs: number;
}): Promise<{ interleaved: Float32Array; frames: number; sampleRate: number }> {
  const bundle = await getOacBundle();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent("<!doctype html><html><body></body></html>");
    await page.addScriptTag({ content: bundle });
    const req: OacRenderRequest = {
      sampleRate: params.sampleRate,
      sourcePcmB64: f32ToB64(params.sourcePcm),
      sourceFrames: params.sourceFrames,
      document: params.document,
      exportDurationMs: params.exportDurationMs,
    };
    const res = (await page.evaluate(async (payload) => {
      const api = (
        globalThis as unknown as {
          __studioFxParityOac?: {
            renderWithOfflineAudioContext: (
              r: OacRenderRequest,
            ) => Promise<OacRenderResponse>;
          };
        }
      ).__studioFxParityOac;
      if (!api) return { sampleRate: 0, frames: 0, interleavedB64: "", error: "bundle missing" };
      return api.renderWithOfflineAudioContext(payload as OacRenderRequest);
    }, req)) as OacRenderResponse;

    if (res.error || !res.interleavedB64) {
      throw new Error(res.error || "OAC render returned empty buffer");
    }
    return {
      interleaved: b64ToF32(res.interleavedB64),
      frames: res.frames,
      sampleRate: res.sampleRate,
    };
  } finally {
    await page.close();
  }
}
