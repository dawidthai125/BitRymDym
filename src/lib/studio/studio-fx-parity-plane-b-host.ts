/**
 * Node host for Stage I.13D Plane B — esbuild + Playwright Chromium.
 */

import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import type {
  PlaneBRenderRequest,
  PlaneBRenderResponse,
} from "@/lib/studio/studio-fx-parity-plane-b-entry";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, "studio-fx-parity-plane-b-entry.ts");
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

export async function getPlaneBBundle(): Promise<string> {
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
    alias: { "@": SRC_ROOT },
    // Browser harness: feature-flag modules read process.env at init.
    // Do not change production DSP — only define env for this IIFE bundle.
    define: {
      "process.env.NODE_ENV": '"test"',
      "process.env.E3_PUBLIC_AUDIO": "undefined",
      "process.env.E3_MIX_ENABLED": "undefined",
      "process.env.E3_RENDER_JOBS_ENABLED": "undefined",
    },
    banner: {
      js: "var process=globalThis.process||{env:{}};",
    },
  });
  const text = result.outputFiles?.[0]?.text;
  if (!text) throw new Error("esbuild produced empty Plane B bundle");
  bundleCache = text;
  return text;
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: [
        "--disable-gpu",
        "--no-sandbox",
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    });
  }
  return browserPromise;
}

export async function closePlaneBHost(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}

export type PlaneBLiveResult = {
  sampleRate: number;
  frames: number;
  interleaved: Float32Array;
  captureMs: number;
  engineLifecycle: string;
  errors: string[];
};

export async function renderViaStudioAudioEngine(params: {
  sourcePcm: Float32Array;
  sourceFrames: number;
  sourceSampleRate: number;
  document: StudioEngineDocument;
  captureDurationMs: number;
  settleMs?: number;
}): Promise<PlaneBLiveResult> {
  const bundle = await getPlaneBBundle();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // AudioWorklet requires a secure context. page.setContent → origin null
    // is insecure. Serve a local HTML document via route intercept on
    // http://127.0.0.1 (no real server, no port 3000 / Supabase).
    const harnessOrigin = "http://127.0.0.1:39137";
    await page.route(`${harnessOrigin}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><html><body><button id='go'>go</button></body></html>",
      });
    });
    await page.goto(`${harnessOrigin}/parity-plane-b`, {
      waitUntil: "domcontentloaded",
    });
    await page.addScriptTag({ content: bundle });
    // Satisfy gesture-gated APIs in some Chromium builds.
    await page.click("#go");

    const req: PlaneBRenderRequest = {
      sourcePcmB64: f32ToB64(params.sourcePcm),
      sourceFrames: params.sourceFrames,
      sourceSampleRate: params.sourceSampleRate,
      document: params.document,
      captureDurationMs: params.captureDurationMs,
      settleMs: params.settleMs ?? 300,
    };

    const res = (await page.evaluate(async (payload) => {
      const api = (
        globalThis as unknown as {
          __studioFxParityPlaneB?: {
            renderWithStudioAudioEngine: (
              r: PlaneBRenderRequest,
            ) => Promise<PlaneBRenderResponse>;
          };
        }
      ).__studioFxParityPlaneB;
      if (!api) {
        return {
          sampleRate: 0,
          frames: 0,
          interleavedB64: "",
          captureMs: 0,
          engineLifecycle: "missing",
          errors: [],
          error: "Plane B bundle missing",
        };
      }
      return api.renderWithStudioAudioEngine(payload as PlaneBRenderRequest);
    }, req)) as PlaneBRenderResponse;

    if (res.error || !res.interleavedB64 || res.frames < 16) {
      throw new Error(
        res.error ||
          `Plane B capture failed (frames=${res.frames}, errors=${res.errors.join(",")})`,
      );
    }

    return {
      sampleRate: res.sampleRate,
      frames: res.frames,
      interleaved: b64ToF32(res.interleavedB64),
      captureMs: res.captureMs,
      engineLifecycle: res.engineLifecycle,
      errors: res.errors,
    };
  } finally {
    await page.close();
  }
}
