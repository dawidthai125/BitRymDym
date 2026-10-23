import {
  resolveFfmpegBin,
  resolveFfprobeBin,
  runCapture,
} from "@/lib/audio/native-ffmpeg";

/**
 * Fail closed before a real encode. Uses the same path resolution as production.
 * `ffmpeg -version` alone does not prove libmp3lame.
 */
export async function assertMp3EncodeToolchain(): Promise<{
  ffmpeg: string;
  ffprobe: string;
}> {
  const ffmpeg = resolveFfmpegBin();
  const ffprobe = resolveFfprobeBin();

  const version = await runCapture(ffmpeg, ["-version"]);
  const versionLine = version.split(/\r?\n/)[0]?.trim() ?? "";
  if (!versionLine.toLowerCase().includes("ffmpeg")) {
    throw new Error(
      `ffmpeg -version did not look like FFmpeg (binary ${ffmpeg}).`,
    );
  }

  await runCapture(ffprobe, ["-version"]);

  const encoders = await runCapture(ffmpeg, ["-encoders"]);
  const hasLame = encoders.split(/\r?\n/).some((line) => {
    const match = /^\s+A\S{5}\s+(\S+)/.exec(line);
    return match?.[1] === "libmp3lame";
  });
  if (!hasLame) {
    throw new Error(
      `libmp3lame is not an audio encoder reported by "${ffmpeg} -encoders".`,
    );
  }

  return { ffmpeg, ffprobe };
}
