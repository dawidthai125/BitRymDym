// Generuje grafiki aplikacji iOS BitRymDym z /public/brand:
//   resources/AppIcon-1024.png      – ikona App Store / AppIcon (1024x1024, RGB bez kanału alfa)
//   resources/splash-2732x2732.png  – ekran startowy (tło #0E0C0A + symbol), Splash.imageset
//   www/logo.png                    – logo na stronie offline (fallback)
//
// Użycie (z katalogu głównego repo; sharp z node_modules aplikacji webowej):
//   node ios-app/tools/generate-assets.mjs
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");
const repo = path.resolve(app, "..");
const require = createRequire(path.join(repo, "package.json"));
const sharp = require("sharp");

const BG = "#0e0c0a"; // --brd-paper (dark)
const SYMBOL = path.join(repo, "public/brand/bitrymdym-symbol-inverse.png"); // kremowe „BRD” + korona

async function symbolBox(box) {
  const trimmed = await sharp(SYMBOL).trim().toBuffer();
  return sharp(trimmed)
    .resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

async function square(size, logoScale, file) {
  await mkdir(path.dirname(file), { recursive: true });
  const logo = await symbolBox(Math.round(size * logoScale));
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: BG })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(file);
}

// App Store odrzuca ikony z przezroczystością → RGB, tło pełne. iOS sam zaokrągla rogi.
await square(1024, 0.68, path.join(app, "resources/AppIcon-1024.png"));
// Splash 2732x2732 (scaleAspectFill w LaunchScreen.storyboard) – symbol ~ 1/4 boku, żeby nie przycinało go na iPhonie.
await square(2732, 0.24, path.join(app, "resources/splash-2732x2732.png"));
// Logo na stronę offline (przezroczyste tło, na ciemnym body).
await sharp(await symbolBox(360)).png({ compressionLevel: 9 }).toFile(path.join(app, "www/logo.png"));

console.log("Zapisano grafiki iOS w", path.join(app, "resources"), "i www/logo.png");
