/**
 * English keyword landing pages (/en/<slug>), each the counterpart of a Polish
 * landing (plSlug) for hreflang. Same product facts as landing-pages.ts; no prices
 * (PLN-only exclusive sale stays Polish-only).
 */
import type { LandingPage } from "@/lib/seo/landing-pages";

export type EnglishLandingPage = LandingPage & { plSlug: string };

export const EN_LANDING_PAGES: readonly EnglishLandingPage[] = [
  {
    slug: "free-rap-beats",
    plSlug: "darmowe-bity-do-rapu",
    navLabel: "Free rap beats",
    metaTitle: "Free rap beats — listen free and record your verse online",
    metaDescription:
      "Free rap beats: trap, boom bap, lo-fi and hip-hop with BPM and key. Listen without an account, then record your verse in the online Studio right in your browser.",
    h1: "Free rap beats",
    lead: "Looking for a free beat for your verse? Preview the whole catalogue without an account, then open the beat that fits in the online Studio and record on it.",
    sections: [
      {
        h2: "Free beats you can record on right away",
        paragraphs: [
          "Every free beat on BitRymDym can be previewed without an account: guests hear a 20-second preview and signed-in users hear the full beat. Filter by genre, tempo (BPM) and key to find something that fits your flow.",
          "Unlike typical beat sites, there is nothing to download or install. Pick a beat, put on headphones and record your vocals in the online Studio in your browser.",
        ],
      },
      {
        h2: "Genres: trap, boom bap, lo-fi, hip-hop",
        paragraphs: [
          "The catalogue has heavy trap with 808s and hi-hat rolls, classic boom bap for storytelling, warm lo-fi for laid-back verses and versatile hip-hop beats. Every genre has its own page with the beats, the tempo range and the most common keys.",
        ],
      },
      {
        h2: "What you can do with a track on a free beat",
        paragraphs: [
          "On the Free plan you can download the finished track as an MP3 with a watermark — to show friends or to publish in the site's track catalogue. A version without the watermark, for releasing and streaming, comes with the paid plans. You can't download the beat itself; you record on it in the Studio.",
        ],
      },
    ],
    faq: [
      {
        q: "Are the beats really free?",
        a: "Yes. You can preview the free catalogue and record a verse on it without paying. You need an account to record; paid plans add longer takes, more tracks and downloads without a watermark.",
      },
      {
        q: "Can I download the beat as MP3 or WAV?",
        a: "No. Free beats are for recording in the BitRymDym Studio and in the Windows recorder. You download the finished track: your vocals on the beat.",
      },
      {
        q: "Do I need an account to listen?",
        a: "No. Without an account you hear a 20-second preview of every beat. After free sign-up you hear the full beat and can record.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/en/beats", label: "Browse the free beats" },
      { href: "/en/jak-nagrac", label: "How to record a track" },
    ],
  },
  {
    slug: "online-recording-studio",
    plSlug: "studio-nagran-online",
    navLabel: "Online recording studio",
    metaTitle: "Online recording studio in your browser — record rap, no install",
    metaDescription:
      "Online recording studio: record vocals in your browser, arrange tracks, cut takes and get a mix and master. All you need is a microphone and headphones. Start free.",
    h1: "Online recording studio",
    lead: "The BitRymDym Studio runs in your browser. Pick a beat, record your voice, arrange the tracks and get a finished, mastered song — no install and no studio booking.",
    sections: [
      {
        h2: "What the online Studio can do",
        paragraphs: [
          "Record vocals on the chosen beat, cut takes, place them on the timeline and add more tracks: doubles, hooks, ad-libs. Set the volume and pan of each track; the Studio also has a piano roll and notes.",
          "BITEK prepares the mix and master: it balances your vocals with the beat and makes a streaming-ready master. You hear every suggestion first and decide whether to apply it.",
        ],
      },
      {
        h2: "What you need",
        paragraphs: [
          "A browser on your computer or phone, a microphone (a USB mic or even the one on your headphones is fine to start) and headphones so the beat doesn't leak into the recording. Do a short mic test and keep the level below clipping.",
          "Take length, number of tracks and download quality depend on the plan. The Free plan lets you start without paying.",
        ],
      },
      {
        h2: "On your phone and on Windows",
        paragraphs: [
          "You can install the site like an app (PWA) from your browser menu. On Windows there is also the Recorder — a program that records your microphone and sends the project to the online Studio.",
        ],
      },
    ],
    faq: [
      {
        q: "Is the online recording studio free?",
        a: "You can start for free on the Free plan. Paid plans add longer takes, more tracks, downloads without a watermark and mastering of your own mix.",
      },
      {
        q: "Does the Studio work on Mac and phones?",
        a: "Yes, the Studio runs in the browser. The Recorder program is Windows-only for now; on a Mac you record in the browser.",
      },
      {
        q: "Do I need to know how to mix?",
        a: "No. BITEK suggests the mix and master; you just listen and accept or reject the change.",
      },
    ],
    beats: null,
    cta: [
      { href: "/studio", label: "Open the Studio" },
      { href: "/en/free-rap-beats", label: "Free rap beats" },
    ],
  },
  {
    slug: "mix-and-mastering-online",
    plSlug: "mix-i-mastering-online",
    navLabel: "Mix and mastering online",
    metaTitle: "Mix and mastering online — streaming-ready master (−14 LUFS)",
    metaDescription:
      "Online mixing and mastering in your browser: BITEK balances vocals with the beat and prepares a streaming master. Upload a finished WAV/MP3 mix for mastering too.",
    h1: "Mix and mastering online",
    lead: "Recorded a verse and it sounds raw? On BitRymDym you mix and master in the browser — for takes recorded in the Studio or for your own finished mix.",
    sections: [
      {
        h2: "Mixing vocals with the beat",
        paragraphs: [
          "After recording in the Studio, ask BITEK for a mix suggestion. It balances your vocals with the beat and prepares a master for streaming. You hear the result first and decide whether to apply it — nothing changes without your approval.",
        ],
      },
      {
        h2: "Mastering for streaming",
        paragraphs: [
          "The master is prepared for streaming platforms. Mastering-only targets −14 LUFS, the loudness Spotify and YouTube normalise to, so your track isn't turned down or made to sound quieter than others.",
          "Already have a finished mix from another program? On the Mastering page (Silver plan and above) you upload a stereo WAV or MP3, preview the master, approve it and download a WAV.",
        ],
      },
    ],
    faq: [
      {
        q: "How many LUFS should a master have?",
        a: "For streaming, around −14 LUFS is the usual target. That is what BitRymDym's mastering-only option aims for.",
      },
      {
        q: "Can I master a track recorded elsewhere?",
        a: "Yes, from the Silver plan. Upload a finished stereo WAV or MP3 mix on the Mastering page and download the master as WAV.",
      },
      {
        q: "Is the mix automatic?",
        a: "BITEK suggests the mix and master, but you apply them only when you accept them.",
      },
    ],
    beats: null,
    cta: [
      { href: "/en/mastering", label: "Mastering only" },
      { href: "/studio", label: "Open the Studio" },
    ],
  },
  {
    slug: "rap-recording-software",
    plSlug: "program-do-nagrywania-rapu",
    navLabel: "Rap recording software",
    metaTitle: "Free rap recording software for Windows — BitRymDym Recorder",
    metaDescription:
      "Free software for recording rap and vocals on Windows: BitRymDym Recorder with catalogue beats, mic test, multiple vocal tracks and upload to the online Studio.",
    h1: "Rap recording software",
    lead: "The BitRymDym Recorder is a free Windows program for recording vocals on catalogue beats. You record at your computer and finish the track in the online Studio.",
    sections: [
      {
        h2: "What the Recorder does",
        paragraphs: [
          "Sign in with the same account as on the website and pick a published beat. Run a mic test before recording; after each take you get a level check: clipping, near silence, quiet or good level.",
          "Record several vocal tracks (up to your plan's limit), mute and solo them, cut parts of the waveform and set volume and pan. When you're done, send the project to your account and open it in the Studio.",
        ],
      },
      {
        h2: "Installation",
        paragraphs: [
          "Download the installer after signing in on the website. It doesn't need administrator rights, and beat playback works out of the box with no extra programs. The Recorder checks for updates itself. On a Mac you record in the browser — a version for Apple devices is coming.",
        ],
      },
    ],
    faq: [
      {
        q: "Is the recording software free?",
        a: "Yes, the Recorder is free. It uses the same account and plan as the website.",
      },
      {
        q: "Does the Recorder mix and master?",
        a: "No. BITEK prepares the mix and master in the Studio on the website; the Recorder records clean vocals.",
      },
      {
        q: "Is there a Mac version?",
        a: "Not yet. On a Mac you record in the browser, on a beat page or in the Studio.",
      },
    ],
    beats: null,
    cta: [
      { href: "/en/nagrywarka", label: "Get the Recorder" },
      { href: "/en/online-recording-studio", label: "Online recording studio" },
    ],
  },
];

export const EN_LANDING_BASE = "/en";

export function englishLandingPath(slug: string): string {
  return `${EN_LANDING_BASE}/${slug}`;
}

export function englishLandingPage(slug: string): EnglishLandingPage {
  const page = EN_LANDING_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown English landing page: ${slug}`);
  return page;
}

/** English twin of a Polish landing slug, if any. */
export function englishTwinOf(plSlug: string): EnglishLandingPage | null {
  return EN_LANDING_PAGES.find((p) => p.plSlug === plSlug) ?? null;
}

/** "/en/free-rap-beats" → true (English-only route, rendered with locale en). */
export function isEnglishLandingPath(pathname: string): boolean {
  return EN_LANDING_PAGES.some((p) => englishLandingPath(p.slug) === pathname.replace(/\/$/, ""));
}
