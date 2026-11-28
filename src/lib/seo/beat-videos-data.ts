/**
 * YouTube videos of catalogue beats (channel @bitrymdym). Pure data, client-safe.
 * New uploads are also picked up live from the channel RSS (beat-videos.ts); this list
 * keeps videos that dropped out of the 15-item feed. Synced from the autopost queue.
 */
export type BeatVideo = { videoId: string; uploadDate: string; title?: string };

export const YOUTUBE_CHANNEL_ID = "UCW_rCfBRpEUgAHPpo1V36nA";

export const BEAT_VIDEOS: Readonly<Record<string, BeatVideo>> = {
  "cf6d9a70-5a5e-443c-a117-263f678a72f1": { videoId: "yWY7JM4xf5k", uploadDate: "2026-11-23" },
  "fd1f8593-10e6-4a9d-b234-5726a9a5db2e": { videoId: "11JEPpFBN0w", uploadDate: "2026-11-23" },
  "a05b6370-eb60-4dc6-a2b2-f29ea965048c": { videoId: "vFpk_gbUO4M", uploadDate: "2026-11-24" },
  "a03f647c-3a6c-4494-ba89-14aea7925dd3": { videoId: "Fb1_IR-dICE", uploadDate: "2026-11-24" },
  "7f96d736-5db8-4a1b-b717-f9aa34e9c4ab": { videoId: "iYsGIQ9cPEk", uploadDate: "2026-11-24" },
  "6b64761a-c520-473f-b147-1ca923e7b145": { videoId: "9BNcaJwk5XE", uploadDate: "2026-11-24" },
  "975eee35-aab0-4d47-8799-26ac9ee52463": { videoId: "cCfIfFUDY8E", uploadDate: "2026-11-24" },
  "3e510e10-03dc-4016-b283-6e4c19023f86": { videoId: "-FbSwO6zTK0", uploadDate: "2026-11-25" },
  "43c6ae61-d85d-40b6-ab87-5163673d7d07": { videoId: "6ihYrQE_6uI", uploadDate: "2026-11-25" },
  "fa7e571c-4c9a-428d-83f5-f27475db206f": { videoId: "jt0OFV_ZlbM", uploadDate: "2026-11-25" },
  "e6852052-530d-4d67-8dfa-763609dbb5e2": { videoId: "mOD4c0SfhsI", uploadDate: "2026-11-25" },
  "dfea08c5-256b-448a-93f1-5a4fe20412a5": { videoId: "JsC7zlqIkKQ", uploadDate: "2026-11-26" },
  "1b4d24a4-ad5a-4dbb-ac23-0d1c19793dd1": { videoId: "YEGApijuDdw", uploadDate: "2026-11-26" },
  "2bef9a0b-90ae-44cb-9b12-dd823ef30a85": { videoId: "jT2ETAT8smY", uploadDate: "2026-11-26" },
  "f5362aef-ebdc-49ec-972d-a39e6b2abe37": { videoId: "wz9DQY0O93E", uploadDate: "2026-11-26" },
  "63e8b85b-812a-45ec-995f-4b6df5559f24": { videoId: "HZyKvNCh1r4", uploadDate: "2026-11-27" },
  "7a6fc6a5-f669-4c3a-894a-fd9368314b05": { videoId: "Qn4TyPQQZCs", uploadDate: "2026-11-27" },
  "4e77802c-004e-438c-bfa8-b56a039bdd14": { videoId: "zgx6_ZdqnxQ", uploadDate: "2026-11-27" },
  "c7bcf73d-8b1e-45fc-9aea-b2f679f611bc": { videoId: "KR119DwpIKQ", uploadDate: "2026-11-27" },
};
