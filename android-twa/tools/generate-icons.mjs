// Generates launcher icons, splash, notification icon and Play Store graphics
// for the BitRymDym TWA from the brand PNGs in /public/brand.
//
// Usage (from repo root, sharp comes from the web app's node_modules):
//   node android-twa/tools/generate-icons.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const here = path.dirname(fileURLToPath(import.meta.url));
const twa = path.resolve(here, "..");
const repo = path.resolve(twa, "..");
const res = path.join(twa, "app/src/main/res");
const store = path.join(twa, "store");

// Dark theme tokens (src/styles/tokens.css, dark): --brd-paper / --brd-ink / --brd-green.
const BG = "#0e0c0a";
const INK = "#f1e7d3";
const ACCENT = "#f2a93b";

const SYMBOL = path.join(repo, "public/brand/bitrymdym-symbol-inverse.png"); // cream "BRD" + crown
const LOGO = path.join(repo, "public/brand/bitrymdym-logo.png"); // dark wordmark (recoloured)

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

async function out(file, pipeline) {
  await mkdir(path.dirname(file), { recursive: true });
  await pipeline.png({ compressionLevel: 9 }).toFile(file);
}

/** Symbol trimmed and fitted (contain) into a transparent square of `box` px. */
async function symbolBox(box) {
  const trimmed = await sharp(SYMBOL).trim().toBuffer();
  return sharp(trimmed)
    .resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Solid colour silhouette of a PNG (keeps its alpha). */
async function silhouette(buffer, color) {
  const { width, height } = await sharp(buffer).metadata();
  const alpha = await sharp(buffer).ensureAlpha().extractChannel("alpha").toBuffer();
  return sharp({ create: { width, height, channels: 3, background: color } })
    .joinChannel(alpha)
    .png()
    .toBuffer();
}

async function onBackground(size, logoScale, { round = false } = {}) {
  const box = Math.round(size * logoScale);
  const logo = await symbolBox(box);
  let img = sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: logo, gravity: "center" }]);
  if (round) {
    const mask = Buffer.from(
      `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`,
    );
    img = sharp(await img.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  return img;
}

async function centered(size, box, buffer) {
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(buffer).resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer(), gravity: "center" }]);
}

for (const [dpi, k] of Object.entries(DENSITIES)) {
  // Legacy launcher icon 48dp (square + round).
  const legacy = Math.round(48 * k);
  await out(path.join(res, `mipmap-${dpi}/ic_launcher.png`), await onBackground(legacy, 0.74));
  await out(path.join(res, `mipmap-${dpi}/ic_launcher_round.png`), await onBackground(legacy, 0.66, { round: true }));

  // Adaptive foreground/monochrome: 108dp canvas, logo inside the 66dp safe zone.
  const adaptive = Math.round(108 * k);
  const fg = await symbolBox(Math.round(60 * k));
  await out(path.join(res, `drawable-${dpi}/ic_launcher_foreground.png`), await centered(adaptive, Math.round(60 * k), fg));
  await out(
    path.join(res, `drawable-${dpi}/ic_launcher_monochrome.png`),
    await centered(adaptive, Math.round(60 * k), await silhouette(fg, "#ffffff")),
  );

  // Splash image (~160dp), shown on the dark splash background.
  await out(path.join(res, `drawable-${dpi}/splash.png`), sharp(await symbolBox(Math.round(160 * k))));

  // Notification small icon: 24dp white silhouette.
  const n = Math.round(24 * k);
  await out(
    path.join(res, `drawable-${dpi}/ic_notification_icon.png`),
    await centered(n, Math.round(22 * k), await silhouette(await symbolBox(n * 4), "#ffffff")),
  );
}

// Play Store: 512x512 icon (full-bleed square; Play applies its own mask).
await out(path.join(store, "icon-512.png"), await onBackground(512, 0.72));

// Play Store: feature graphic 1024x500.
{
  const W = 1024;
  const H = 500;
  const logoTrim = await sharp(LOGO).trim().toBuffer();
  const logoCream = await silhouette(
    await sharp(logoTrim).resize({ width: 600 }).png().toBuffer(),
    INK,
  );
  const logoMeta = await sharp(logoCream).metadata();
  const crown = await symbolBox(300);
  const bg = Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="78%" cy="45%" r="70%">
          <stop offset="0" stop-color="#2a1f12"/>
          <stop offset="1" stop-color="${BG}"/>
        </radialGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <rect x="64" y="${H - 92}" width="72" height="4" fill="${ACCENT}"/>
      <text x="64" y="${H - 48}" font-family="DejaVu Sans, Nimbus Sans, sans-serif" font-size="34"
            font-weight="bold" fill="${INK}">Bity. Nagrywanie. Mix i master.</text>
    </svg>`);
  const crownFaded = await sharp(crown)
    .composite([{ input: Buffer.from([255, 255, 255, 60]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: "dest-in" }])
    .toBuffer();
  await out(
    path.join(store, "feature-graphic-1024x500.png"),
    sharp(bg).composite([
      { input: crownFaded, left: W - 300 - 56, top: Math.round((H - 300) / 2) },
      { input: logoCream, left: 56, top: Math.max(40, Math.round((H - 120 - logoMeta.height) / 2)) },
    ]).flatten({ background: BG }),
  );
}

console.log("Icons and store graphics written to", res, "and", store);
