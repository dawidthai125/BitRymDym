/**
 * Golden fixture metadata for V5 analysis (tooling only).
 * BPM ground truth always comes from source title/page — never from detectors.
 * Material marked UNKNOWN when not confidently known.
 */

export type MaterialType =
  | "FULL_BEAT"
  | "MUSIC_LOOP"
  | "DRUM_LOOP"
  | "MELODY_LOOP"
  | "SPARSE"
  | "DENSE"
  | "UNKNOWN";

export type GoldenMeta = {
  id: number;
  username: string;
  bpm: number;
  layer: "boombap" | "trap" | "drill";
  material: MaterialType;
  license: string;
  author: string;
  title: string;
  batch: "v1" | "v4" | "v5";
};

/** All curated Freesound golden entries (id → meta). */
export const GOLDEN_BY_ID: Record<number, GoldenMeta> = {
  // v1 / original
  680221: { id: 680221, username: "josefpres", bpm: 90, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "josefpres", title: "Rap beat 001 simple mix 02 short loop 90 bpm", batch: "v1" },
  682512: { id: 682512, username: "josefpres", bpm: 90, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "josefpres", title: "Rap beat 001 simple mix 05 short loop 90 bpm", batch: "v1" },
  413688: { id: 413688, username: "Krishmeister", bpm: 90, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Hip-Hop Beat 01 90 BpM", batch: "v1" },
  336134: { id: 336134, username: "phantastonia", bpm: 100, layer: "boombap", material: "MUSIC_LOOP", license: "CC0 / Public Domain", author: "phantastonia", title: "Hip Hop4_100_BPM", batch: "v1" },
  413687: { id: 413687, username: "Krishmeister", bpm: 100, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Hip-Hop Beat 01 100 BpM", batch: "v1" },
  336135: { id: 336135, username: "phantastonia", bpm: 90, layer: "boombap", material: "MUSIC_LOOP", license: "CC0 / Public Domain", author: "phantastonia", title: "Hip Hop9_90_BPM", batch: "v1" },
  838789: { id: 838789, username: "AudioWay", bpm: 142, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "AudioWay", title: "Farewell | Hip-Hop [BPM-142]", batch: "v1" },
  590045: { id: 590045, username: "sub33", bpm: 87, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "sub33", title: "UltimoBreak87", batch: "v1" },
  629137: { id: 629137, username: "holizna", bpm: 88, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "Funky Lofi Drum Loop 88 BPM", batch: "v1" },
  456135: { id: 456135, username: "RokZRooM", bpm: 140, layer: "trap", material: "FULL_BEAT", license: "CC0", author: "RokZRooM", title: "Mystery Trap Beat Loop", batch: "v1" },
  852261: { id: 852261, username: "holizna", bpm: 140, layer: "trap", material: "MUSIC_LOOP", license: "CC0", author: "holizna", title: "Dark Trap Loop #2 C#min 140 BPM", batch: "v1" },
  852265: { id: 852265, username: "holizna", bpm: 150, layer: "trap", material: "MELODY_LOOP", license: "CC0", author: "holizna", title: "Trap Melody Loop #1 Emin 150 BPM", batch: "v1" },
  852274: { id: 852274, username: "holizna", bpm: 140, layer: "trap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "Trap Drum Loop #3 140 BPM", batch: "v1" },
  852267: { id: 852267, username: "holizna", bpm: 140, layer: "trap", material: "MELODY_LOOP", license: "CC0", author: "holizna", title: "Trap Melody Loop #3 F#min 140 BPM", batch: "v1" },
  484625: { id: 484625, username: "Loop_Cult", bpm: 140, layer: "drill", material: "DRUM_LOOP", license: "CC0", author: "Loop_Cult", title: "LCHZ_140_Drum_07_Full", batch: "v1" },
  484640: { id: 484640, username: "Loop_Cult", bpm: 140, layer: "drill", material: "DRUM_LOOP", license: "CC0", author: "Loop_Cult", title: "LCCPTL_140_Drum_Full_04", batch: "v1" },
  797967: { id: 797967, username: "harrisonlace", bpm: 140, layer: "trap", material: "MUSIC_LOOP", license: "CC0", author: "harrisonlace", title: "WAGER_trap_drum_bass_loop_Ebmin_140", batch: "v1" },
  // v4
  413686: { id: 413686, username: "Krishmeister", bpm: 110, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Hip-Hop Beat 01 110 BpM", batch: "v4" },
  413685: { id: 413685, username: "Krishmeister", bpm: 120, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Hip-Hop Beat 01 120 BpM", batch: "v4" },
  413684: { id: 413684, username: "Krishmeister", bpm: 130, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Hip-Hop Beat 01 130 BpM", batch: "v4" },
  412806: { id: 412806, username: "Krishmeister", bpm: 120, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Drums 120 BpM", batch: "v4" },
  413240: { id: 413240, username: "Krishmeister", bpm: 130, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Drums 130 BpM", batch: "v4" },
  413241: { id: 413241, username: "Krishmeister", bpm: 110, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "Krishmeister", title: "Basic Drums 110 BpM", batch: "v4" },
  546149: { id: 546149, username: "AudioWay", bpm: 160, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "AudioWay", title: "Tunnel Vision | Hip-Hop BPM 160", batch: "v4" },
  640251: { id: 640251, username: "AudioWay", bpm: 130, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "AudioWay", title: "Satisfaction | 130 BPM", batch: "v4" },
  640252: { id: 640252, username: "AudioWay", bpm: 136, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "AudioWay", title: "L.L.L. | 136 BPM", batch: "v4" },
  640253: { id: 640253, username: "AudioWay", bpm: 166, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "AudioWay", title: "Interlude | 166 BPM", batch: "v4" },
  573961: { id: 573961, username: "blakengouda", bpm: 145, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 145bpm", batch: "v4" },
  621185: { id: 621185, username: "holizna", bpm: 80, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "Perc Loop 80 BPM", batch: "v4" },
  621184: { id: 621184, username: "holizna", bpm: 90, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "Perc Loop 90 BPM", batch: "v4" },
  866738: { id: 866738, username: "holizna", bpm: 75, layer: "boombap", material: "MELODY_LOOP", license: "CC0", author: "holizna", title: "Lo-Fi Piano Loop A 75 BPM", batch: "v4" },
  // v5
  416061: { id: 416061, username: "danyourmaster", bpm: 135, layer: "trap", material: "FULL_BEAT", license: "CC0", author: "danyourmaster", title: "Trap rap loop 135 bpm", batch: "v5" },
  573964: { id: 573964, username: "blakengouda", bpm: 138, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 138bpm", batch: "v5" },
  848121: { id: 848121, username: "looplicator", bpm: 148, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "looplicator", title: "148 BPM Industrial Drum Loop", batch: "v5" },
  852263: { id: 852263, username: "holizna", bpm: 155, layer: "trap", material: "MUSIC_LOOP", license: "CC0", author: "holizna", title: "Dark Trap Loop #7 Emin 155 BPM", batch: "v5" },
  573965: { id: 573965, username: "blakengouda", bpm: 171, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 171bpm", batch: "v5" },
  510002: { id: 510002, username: "blakengouda", bpm: 170, layer: "boombap", material: "SPARSE", license: "CC0", author: "blakengouda", title: "Hi-Hat Loop 9 (170 bpm)", batch: "v5" },
  832200: { id: 832200, username: "looplicator", bpm: 175, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "looplicator", title: "175 BPM Industrial Drum Loop", batch: "v5" },
  829052: { id: 829052, username: "looplicator", bpm: 180, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "looplicator", title: "180 BPM Industrial Drum Loop", batch: "v5" },
  573970: { id: 573970, username: "blakengouda", bpm: 179, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 179bpm", batch: "v5" },
  629140: { id: 629140, username: "holizna", bpm: 70, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "Lofi Drum Loop 70 BPM", batch: "v5" },
  629134: { id: 629134, username: "holizna", bpm: 76, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "76 BPM LOFI DRUM LOOP", batch: "v5" },
  534623: { id: 534623, username: "BaDoink", bpm: 84, layer: "boombap", material: "MUSIC_LOOP", license: "CC0", author: "BaDoink", title: "Forever No More Loop 84 bpm", batch: "v5" },
  573960: { id: 573960, username: "blakengouda", bpm: 86, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 86bpm", batch: "v5" },
  629132: { id: 629132, username: "holizna", bpm: 95, layer: "boombap", material: "DENSE", license: "CC0", author: "holizna", title: "Boom Bap Hiphop Kick Snare Loop 95 BPM", batch: "v5" },
  573958: { id: 573958, username: "blakengouda", bpm: 95, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 95bpm", batch: "v5" },
  573951: { id: 573951, username: "blakengouda", bpm: 100, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 100bpm", batch: "v5" },
  573955: { id: 573955, username: "blakengouda", bpm: 111, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 111bpm", batch: "v5" },
  573954: { id: 573954, username: "blakengouda", bpm: 121, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 121bpm", batch: "v5" },
  573957: { id: 573957, username: "blakengouda", bpm: 124, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 124bpm", batch: "v5" },
  573956: { id: 573956, username: "blakengouda", bpm: 132, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 132bpm", batch: "v5" },
  852260: { id: 852260, username: "holizna", bpm: 130, layer: "trap", material: "MUSIC_LOOP", license: "CC0", author: "holizna", title: "Dark Trap #1 F#min 130 BPM", batch: "v5" },
  573962: { id: 573962, username: "blakengouda", bpm: 144, layer: "boombap", material: "DRUM_LOOP", license: "CC0", author: "blakengouda", title: "Hip-Hop Drum Loop - 144bpm", batch: "v5" },
  852268: { id: 852268, username: "holizna", bpm: 165, layer: "trap", material: "MELODY_LOOP", license: "CC0", author: "holizna", title: "Trap Melody Loop #5 Ebmin 165 BPM", batch: "v5" },
  852269: { id: 852269, username: "holizna", bpm: 160, layer: "trap", material: "DRUM_LOOP", license: "CC0", author: "holizna", title: "Trap Drum #1 160 BPM", batch: "v5" },
  484630: { id: 484630, username: "Loop_Cult", bpm: 120, layer: "drill", material: "DRUM_LOOP", license: "CC0", author: "Loop_Cult", title: "LCC_120_Drum_01_Full", batch: "v5" },
};

export function fsIdFromFile(file: string): number | null {
  const m = file.match(/-fs(\d+)\./i);
  return m ? Number(m[1]) : null;
}

export function metaForFile(file: string): GoldenMeta | null {
  const id = fsIdFromFile(file);
  if (id == null) return null;
  return GOLDEN_BY_ID[id] ?? null;
}
