/**
 * E3.6-C — Native FFmpeg / ffprobe helpers (OD-E36-04 = C).
 * EXTERNAL worker host binaries only — not an npm encoder package.
 */

import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";

export function resolveFfmpegBin(): string {
  return process.env.E3_FFMPEG_PATH?.trim() || "ffmpeg";
}

export function resolveFfprobeBin(): string {
  return process.env.E3_FFPROBE_PATH?.trim() || "ffprobe";
}

export async function assertNativeFfmpegAvailable(): Promise<{
  ffmpeg: string;
  ffprobe: string;
  versionLine: string;
}> {
  const ffmpeg = resolveFfmpegBin();
  const ffprobe = resolveFfprobeBin();

  // If absolute/custom path, ensure readable. PATH binaries validated by spawn.
  if (ffmpeg.includes("\\") || ffmpeg.includes("/")) {
    try {
      await access(ffmpeg, fsConstants.X_OK);
    } catch {
      try {
        await access(ffmpeg, fsConstants.F_OK);
      } catch {
        throw new RenderJobDomainError(
          `E3_FFMPEG_PATH not found: ${ffmpeg}`,
          "DISABLED",
        );
      }
    }
  }

  const versionLine = await runCapture(ffmpeg, ["-version"]).then((out) => {
    const line = out.split(/\r?\n/)[0]?.trim() ?? "";
    if (!line.toLowerCase().includes("ffmpeg")) {
      throw new RenderJobDomainError(
        "ffmpeg -version did not look like FFmpeg.",
        "DISABLED",
      );
    }
    return line;
  });

  await runCapture(ffprobe, ["-version"]);

  return { ffmpeg, ffprobe, versionLine };
}

export async function runCapture(
  bin: string,
  args: string[],
  options?: { input?: Buffer; timeoutMs?: number },
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new RenderJobDomainError(
          `${bin} timed out after ${timeoutMs}ms`,
          "LIMIT",
        ),
      );
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => stdout.push(c));
    child.stderr.on("data", (c: Buffer) => stderr.push(c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(
        new RenderJobDomainError(
          `${bin} spawn failed: ${err.message}`,
          "DISABLED",
        ),
      );
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(
          new RenderJobDomainError(
            `${bin} exited ${code}: ${err.slice(0, 500) || out.slice(0, 500)}`,
            "INVALID",
          ),
        );
        return;
      }
      resolve(out || err);
    });
    if (options?.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();
  });
}

export async function runFfmpegFile(
  args: string[],
  timeoutMs = 120_000,
): Promise<void> {
  const ffmpeg = resolveFfmpegBin();
  await runCapture(ffmpeg, args, { timeoutMs });
}
