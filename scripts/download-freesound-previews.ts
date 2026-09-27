/**
 * Download Freesound HQ MP3 previews for licensed fixtures (tooling only).
 * Full original WAV requires Freesound login — HQ preview is official CDN encode.
 *
 * Usage: npx tsx scripts/download-freesound-previews.ts
 */

import fs from "node:fs";
import path from "node:path";

type Candidate = {
  id: number;
  username: string;
  bpm: number;
  layer: "boombap" | "trap" | "drill";
  material: "FULL_BEAT" | "MUSIC_LOOP" | "DRUM_LOOP" | "MELODY_LOOP" | "SPARSE" | "DENSE" | "UNKNOWN";
  license: string;
  author: string;
  title: string;
  sourceDurationSec: number;
  notes: string;
};

/** Curated after page license + BPM verification. */
export const FREESOUND_CANDIDATES: Candidate[] = [
  {
    id: 680221,
    username: "josefpres",
    bpm: 90,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "josefpres",
    title: "Rap beat 001 simple mix 02 short loop 90 bpm",
    sourceDurationSec: 42.666,
    notes: "Rap beat loop; source states usable at 90 bpm",
  },
  {
    id: 682512,
    username: "josefpres",
    bpm: 90,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "josefpres",
    title: "Rap beat 001 simple mix 05 short loop 90 bpm",
    sourceDurationSec: 42.666,
    notes: "Alternate mix of same pack; 90 bpm",
  },
  {
    id: 413688,
    username: "Krishmeister",
    bpm: 90,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Hip-Hop Beat 01 90 BpM",
    sourceDurationSec: 11.333,
    notes: "Basic hip-hop drum loop",
  },
  {
    id: 336134,
    username: "phantastonia",
    bpm: 100,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0 / Public Domain (author)",
    author: "phantastonia",
    title: "Hip Hop4_100_BPM",
    sourceDurationSec: 12.0,
    notes: "Author: No attribution required - Public Domain",
  },
  {
    id: 413687,
    username: "Krishmeister",
    bpm: 100,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Hip-Hop Beat 01 100 BpM",
    sourceDurationSec: 10.199,
    notes: "Basic hip-hop drum loop",
  },
  {
    id: 336135,
    username: "phantastonia",
    bpm: 90,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0 / Public Domain (author)",
    author: "phantastonia",
    title: "Hip Hop9_90_BPM",
    sourceDurationSec: 12.666,
    notes: "Author: No attribution required - Public Domain",
  },
  {
    id: 838789,
    username: "AudioWay",
    bpm: 142,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "AudioWay",
    title: "Farewell | Hip-Hop [BPM-142]",
    sourceDurationSec: 13.521,
    notes: "Hip-hop loop; page footer CC0; author notes credit appreciated",
  },
  {
    id: 590045,
    username: "sub33",
    bpm: 87,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "sub33",
    title: "UltimoBreak87",
    sourceDurationSec: 5.517,
    notes: "Classic hip-hop drumloop; short (<10s) but priority BPM 87",
  },
  {
    id: 629137,
    username: "holizna",
    bpm: 88,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Funky Lofi Drum Loop 88 BPM",
    sourceDurationSec: 21.818,
    notes: "Author explicitly CC0; lofi drum loop",
  },
  {
    id: 456135,
    username: "RokZRooM",
    bpm: 140,
    layer: "trap",
    material: "FULL_BEAT",
    license: "CC0",
    author: "RokZRooM",
    title: "Mystery Trap Beat Loop",
    sourceDurationSec: 31.16,
    notes: "Trap beat loop; source BPM 140",
  },
  {
    id: 852261,
    username: "holizna",
    bpm: 140,
    layer: "trap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Dark Trap Loop #2 C#min 140 BPM",
    sourceDurationSec: 13.714,
    notes: "Dark trap music loop",
  },
  {
    id: 852265,
    username: "holizna",
    bpm: 150,
    layer: "trap",
    material: "MELODY_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Trap Melody Loop #1 Emin 150 BPM",
    sourceDurationSec: 25.6,
    notes: "Trap melody (no full drums) — secondary material class",
  },
  {
    id: 852274,
    username: "holizna",
    bpm: 140,
    layer: "trap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Trap Drum Loop #3 140 BPM",
    sourceDurationSec: 27.428,
    notes: "Trap drums; tags also mention 70bpm half — expected = 140 per title",
  },
  {
    id: 852267,
    username: "holizna",
    bpm: 140,
    layer: "trap",
    material: "MELODY_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Trap Melody Loop #3 F#min 140 BPM",
    sourceDurationSec: 13.714,
    notes: "Trap melody loop",
  },
  {
    id: 484625,
    username: "Loop_Cult",
    bpm: 140,
    layer: "drill",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Loop_Cult",
    title: "LCHZ_140_Drum_07_Full",
    sourceDurationSec: 6.857,
    notes: "UK drill & trap drum loop (short); expected 140",
  },
  {
    id: 484640,
    username: "Loop_Cult",
    bpm: 140,
    layer: "drill",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Loop_Cult",
    title: "LCCPTL_140_Drum_Full_04",
    sourceDurationSec: 6.857,
    notes: "UK drill & trap drum loop (short); expected 140",
  },
  {
    id: 797967,
    username: "harrisonlace",
    bpm: 140,
    layer: "trap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "harrisonlace",
    title: "WAGER_trap_drum_bass_loop_Ebmin_140",
    sourceDurationSec: 13.717,
    notes: "Trap/grime drum+bass loop; source upload is MP3",
  },
  // --- V4 golden expansion (CC0 + source-stated BPM; not detector-labeled) ---
  {
    id: 413686,
    username: "Krishmeister",
    bpm: 110,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Hip-Hop Beat 01 110 BpM",
    sourceDurationSec: 8.727,
    notes: "Same Krishmeister hip-hop drum series as 90/100; V4 band 101–110",
  },
  {
    id: 413685,
    username: "Krishmeister",
    bpm: 120,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Hip-Hop Beat 01 120 BpM",
    sourceDurationSec: 8.5,
    notes: "Priority BPM 120; short drum loop",
  },
  {
    id: 413684,
    username: "Krishmeister",
    bpm: 130,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Hip-Hop Beat 01 130 BpM",
    sourceDurationSec: 7.846,
    notes: "Priority BPM 130; short drum loop",
  },
  {
    id: 412806,
    username: "Krishmeister",
    bpm: 120,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Drums 120 BpM",
    sourceDurationSec: 8.0,
    notes: "Studio Drummer practice loop; second 120 fixture",
  },
  {
    id: 413240,
    username: "Krishmeister",
    bpm: 130,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Drums 130 BpM",
    sourceDurationSec: 7.384,
    notes: "Studio Drummer practice loop; second 130 fixture",
  },
  {
    id: 413241,
    username: "Krishmeister",
    bpm: 110,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Krishmeister",
    title: "Basic Drums 110 BpM",
    sourceDurationSec: 8.727,
    notes: "Studio Drummer practice loop; second 110 fixture",
  },
  {
    id: 546149,
    username: "AudioWay",
    bpm: 160,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "AudioWay",
    title: "Tunnel Vision | Hip-Hop / Rap Beat Loop | BPM: 160",
    sourceDurationSec: 60.0,
    notes: "Priority BPM 160; full-length hip-hop loop; CC0 page",
  },
  {
    id: 640251,
    username: "AudioWay",
    bpm: 130,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "AudioWay",
    title: "Satisfaction | 130 BPM | G Minor",
    sourceDurationSec: 30.0,
    notes: "Hip-hop/rap loop; source BPM 130",
  },
  {
    id: 640252,
    username: "AudioWay",
    bpm: 136,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "AudioWay",
    title: "L.L.L. (Life Long Lessons) | 136 BPM | C Minor",
    sourceDurationSec: 30.0,
    notes: "Near 135/138 priority band",
  },
  {
    id: 640253,
    username: "AudioWay",
    bpm: 166,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "AudioWay",
    title: "Interlude | 166 BPM | C Minor",
    sourceDurationSec: 30.0,
    notes: "161–180 band coverage",
  },
  {
    id: 573961,
    username: "blakengouda",
    bpm: 145,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 145bpm",
    sourceDurationSec: 13.284,
    notes: "Priority BPM 145; CC0 verified",
  },
  {
    id: 621185,
    username: "holizna",
    bpm: 80,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Perc Loop 80 BPM",
    sourceDurationSec: 12.0,
    notes: "70–80 band; percussion loop",
  },
  {
    id: 621184,
    username: "holizna",
    bpm: 90,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Perc Loop 90 BPM",
    sourceDurationSec: 10.666,
    notes: "Extra 90 percussion fixture",
  },
  {
    id: 866738,
    username: "holizna",
    bpm: 75,
    layer: "boombap",
    material: "MELODY_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Lo-Fi Piano Loop A - Garden Amin 75 BPM",
    sourceDurationSec: 12.8,
    notes: "70–80 band; melody/piano — secondary material",
  },
  // --- V5 golden expansion (CC0 + source-stated BPM; gaps + diversity) ---
  {
    id: 416061,
    username: "danyourmaster",
    bpm: 135,
    layer: "trap",
    material: "FULL_BEAT",
    license: "CC0",
    author: "danyourmaster",
    title: "Trap rap loop 135 bpm",
    sourceDurationSec: 3.592,
    notes: "PRIORITY gap 135; short 2-bar trap with 808 — keep for BPM coverage",
  },
  {
    id: 573964,
    username: "blakengouda",
    bpm: 138,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 138bpm",
    sourceDurationSec: 55.576,
    notes: "PRIORITY gap 138",
  },
  {
    id: 848121,
    username: "looplicator",
    bpm: 148,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "looplicator",
    title: "148 BPM Industrial Drum Loop #16125 (WAV)",
    sourceDurationSec: 10.0,
    notes: "PRIORITY gap 148; industrial drums (not hip-hop) — diversity",
  },
  {
    id: 852263,
    username: "holizna",
    bpm: 155,
    layer: "trap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Dark Trap Loop #7 Emin 155 BPM",
    sourceDurationSec: 15.0,
    notes: "PRIORITY gap 155",
  },
  {
    id: 573965,
    username: "blakengouda",
    bpm: 171,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 171bpm",
    sourceDurationSec: 11.325,
    notes: "Near priority 170 (no verified CC0 exact-170 full drums besides sparse hi-hat)",
  },
  {
    id: 510002,
    username: "blakengouda",
    bpm: 170,
    layer: "boombap",
    material: "SPARSE",
    license: "CC0",
    author: "blakengouda",
    title: "Hi-Hat Loop 9 (170 bpm)",
    sourceDurationSec: 11.351,
    notes: "PRIORITY 170; sparse hi-hat only — material diversity",
  },
  {
    id: 832200,
    username: "looplicator",
    bpm: 175,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "looplicator",
    title: "175 BPM Industrial Drum Loop #15539 (WAV)",
    sourceDurationSec: 10.971,
    notes: "Priority band 171–180; industrial",
  },
  {
    id: 829052,
    username: "looplicator",
    bpm: 180,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "looplicator",
    title: "180 BPM Industrial Drum Loop #15353 (WAV)",
    sourceDurationSec: 10.666,
    notes: "PRIORITY gap 180",
  },
  {
    id: 573970,
    username: "blakengouda",
    bpm: 179,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 179bpm",
    sourceDurationSec: 12.0,
    notes: "Near 180 hip-hop drums",
  },
  {
    id: 629140,
    username: "holizna",
    bpm: 70,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Lofi Drum Loop 70 BPM",
    sourceDurationSec: 20.0,
    notes: "70–80 band low edge",
  },
  {
    id: 629134,
    username: "holizna",
    bpm: 76,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "76 BPM LOFI DRUM LOOP",
    sourceDurationSec: 20.0,
    notes: "70–80 band",
  },
  {
    id: 534623,
    username: "BaDoink",
    bpm: 84,
    layer: "boombap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "BaDoink",
    title: "Forever No More Loop 84 bpm",
    sourceDurationSec: 30.0,
    notes: "81–90 band music loop",
  },
  {
    id: 573960,
    username: "blakengouda",
    bpm: 86,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 86bpm",
    sourceDurationSec: 20.0,
    notes: "81–90 band",
  },
  {
    id: 629132,
    username: "holizna",
    bpm: 95,
    layer: "boombap",
    material: "DENSE",
    license: "CC0",
    author: "holizna",
    title: "Boom Bap Hiphop Kick Snare Loop 95 BPM",
    sourceDurationSec: 40.421,
    notes: "91–100 dense kick/snare",
  },
  {
    id: 573958,
    username: "blakengouda",
    bpm: 95,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 95bpm",
    sourceDurationSec: 20.0,
    notes: "Second 95 fixture",
  },
  {
    id: 573951,
    username: "blakengouda",
    bpm: 100,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 100bpm",
    sourceDurationSec: 20.0,
    notes: "Extra 100 drum loop",
  },
  {
    id: 573955,
    username: "blakengouda",
    bpm: 111,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 111bpm",
    sourceDurationSec: 20.0,
    notes: "101–110 / 111–120 boundary",
  },
  {
    id: 573954,
    username: "blakengouda",
    bpm: 121,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 121bpm",
    sourceDurationSec: 20.0,
    notes: "121–130 band",
  },
  {
    id: 573957,
    username: "blakengouda",
    bpm: 124,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 124bpm",
    sourceDurationSec: 20.0,
    notes: "121–130 band",
  },
  {
    id: 573956,
    username: "blakengouda",
    bpm: 132,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 132bpm",
    sourceDurationSec: 20.0,
    notes: "131–140 band",
  },
  {
    id: 852260,
    username: "holizna",
    bpm: 130,
    layer: "trap",
    material: "MUSIC_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Dark Trap #1 F#min 130 BPM",
    sourceDurationSec: 15.0,
    notes: "Extra 130 music loop diversity",
  },
  {
    id: 573962,
    username: "blakengouda",
    bpm: 144,
    layer: "boombap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "blakengouda",
    title: "Hip-Hop Drum Loop - 144bpm",
    sourceDurationSec: 20.0,
    notes: "141–150; not a substitute for missing exact-148 hip-hop (industrial 148 separate)",
  },
  {
    id: 852268,
    username: "holizna",
    bpm: 165,
    layer: "trap",
    material: "MELODY_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Trap Melody Loop #5 Ebmin 165 BPM",
    sourceDurationSec: 15.0,
    notes: "151–170 melody diversity",
  },
  {
    id: 852269,
    username: "holizna",
    bpm: 160,
    layer: "trap",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "holizna",
    title: "Trap Drum #1 160 BPM",
    sourceDurationSec: 15.0,
    notes: "Second 160 drum",
  },
  {
    id: 484630,
    username: "Loop_Cult",
    bpm: 120,
    layer: "drill",
    material: "DRUM_LOOP",
    license: "CC0",
    author: "Loop_Cult",
    title: "LCC_120_Drum_01_Full",
    sourceDurationSec: 8.0,
    notes: "Extra 120 drill drums; BPM from filename LCC_120",
  },
];

const FIXTURES_DIR = path.resolve(process.cwd(), "..", "bitrymdym-fixtures");

function fixtureFilename(c: Candidate): string {
  return `rap-${c.layer}-${c.bpm}-fs${c.id}.mp3`;
}

function sourceUrl(c: Candidate): string {
  return `https://freesound.org/people/${c.username}/sounds/${c.id}/`;
}

async function scrapeHqPreviewUrl(pageUrl: string): Promise<string | null> {
  const res = await fetch(pageUrl, {
    headers: { "User-Agent": "BitRymDym-BPM-Benchmark/1.0 (fixture acquisition)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${pageUrl}`);
  const html = await res.text();
  const m = html.match(
    /https:\/\/cdn\.freesound\.org\/previews\/\d+\/\d+_[^"'>\s]+-hq\.mp3/i,
  );
  return m?.[0] ?? null;
}

async function downloadFile(url: string, dest: string): Promise<number> {
  const res = await fetch(url, {
    headers: { "User-Agent": "BitRymDym-BPM-Benchmark/1.0 (fixture acquisition)" },
  });
  if (!res.ok) throw new Error(`Download HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function validateMp3(filePath: string): Promise<{
  sampleRate: number;
  channels: number;
  durationSeconds: number;
}> {
  const decode = (await import("audio-decode")).default;
  const buf = fs.readFileSync(filePath);
  const audio = await decode(buf);
  const channelData = audio.channelData as Float32Array[];
  const length = channelData[0]?.length ?? 0;
  return {
    sampleRate: audio.sampleRate,
    channels: channelData.length,
    durationSeconds: length / audio.sampleRate,
  };
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const downloaded: Array<Record<string, unknown>> = [];
  const skipped: Array<Record<string, unknown>> = [];

  for (const c of FREESOUND_CANDIDATES) {
    const file = fixtureFilename(c);
    const dest = path.join(FIXTURES_DIR, file);
    const page = sourceUrl(c);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      skipped.push({ id: c.id, reason: "already exists", file });
      continue;
    }
    try {
      const hq = await scrapeHqPreviewUrl(page);
      if (!hq) {
        skipped.push({ id: c.id, reason: "no hq.mp3 preview URL on page" });
        continue;
      }
      const bytes = await downloadFile(hq, dest);
      const meta = await validateMp3(dest);
      if (!(meta.durationSeconds > 1)) {
        skipped.push({ id: c.id, reason: "duration too short after decode" });
        fs.unlinkSync(dest);
        continue;
      }
      downloaded.push({
        file,
        id: c.id,
        bpm: c.bpm,
        layer: c.layer,
        material: c.material,
        license: c.license,
        author: c.author,
        source: page,
        previewUrl: hq,
        bytes,
        ...meta,
      });
      console.error(`OK ${file} (${bytes} bytes, ${meta.durationSeconds.toFixed(2)}s)`);
    } catch (e) {
      skipped.push({
        id: c.id,
        reason: e instanceof Error ? e.message : String(e),
      });
      console.error(`FAIL ${c.id}:`, e);
    }
  }

  console.log(
    JSON.stringify(
      {
        fixturesDir: FIXTURES_DIR,
        downloadedCount: downloaded.length,
        skippedCount: skipped.length,
        downloaded,
        skipped,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
