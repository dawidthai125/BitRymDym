/**
 * Generate a Chromium MediaRecorder audio/webm;codecs=opus capture
 * that omits Info.Duration (timesliced), matching production W3 blocker.
 */
import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer-core";

const outPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/beats/fixtures/chromium-mediarecorder-opus.webm",
);

const chromePath =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

try {
  const page = await browser.newPage();
  // Secure origin so navigator.mediaDevices is available.
  await page.goto("https://example.com", { waitUntil: "domcontentloaded" });

  const result = await page.evaluate(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      const done = new Promise((resolve) => {
        rec.onstop = () => resolve(null);
      });
      rec.start(250);
      await new Promise((r) => setTimeout(r, 3200));
      rec.stop();
      await done;
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mime });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let raw = "";
      const step = 0x8000;
      for (let i = 0; i < buf.length; i += step) {
        raw += String.fromCharCode.apply(null, buf.subarray(i, i + step));
      }
      return { mime, size: buf.length, b64: btoa(raw) };
    } catch (e) {
      return { error: String(e) };
    }
  });

  if (!result || result.error || !result.b64) {
    console.error("CAPTURE_FAIL", result);
    process.exit(1);
  }

  const bytes = Buffer.from(result.b64, "base64");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes);
  console.log(
    JSON.stringify({
      path: outPath,
      mime: result.mime,
      size: bytes.length,
    }),
  );
} finally {
  await browser.close();
}
