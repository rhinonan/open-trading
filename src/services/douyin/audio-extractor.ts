// src/services/douyin/audio-extractor.ts
import * as fs from "fs";
import * as path from "path";
import { FFmpeg } from "@ffmpeg/ffmpeg";

const AUDIO_DIR = path.join(process.cwd(), "data", "audio");

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<void> | null = null;

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  if (!ffmpegLoading) {
    ffmpegLoading = (async () => {
      // @ffmpeg/core v0.12.10 exports map only has "." and "./wasm" —
      // require.resolve("@ffmpeg/core/dist/esm/ffmpeg-core.js") will FAIL.
      // Instead, resolve the main entry and derive paths from its directory.
      const coreEntry = require.resolve("@ffmpeg/core");
      const coreDir = path.dirname(coreEntry);
      const coreURL = path.join(coreDir, "ffmpeg-core.js");
      const wasmURL = path.join(coreDir, "ffmpeg-core.wasm");

      ffmpegInstance = new FFmpeg();
      await ffmpegInstance.load({
        coreURL,
        wasmURL,
      });
    })();
  }

  await ffmpegLoading;
  return ffmpegInstance!;
}

/**
 * Use ffmpeg WASM to extract audio track from a video, output PCM 16KHz mono WAV.
 * @param videoPath - local video file path
 * @param awemeId - Douyin video aweme_id
 * @returns local audio file path data/audio/{awemeId}.wav
 */
export async function extractAudio(
  videoPath: string,
  awemeId: string
): Promise<string> {
  ensureDir(AUDIO_DIR);
  const outputPath = path.join(AUDIO_DIR, `${awemeId}.wav`);

  // Idempotent: skip if output already exists and is non-empty
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    return outputPath;
  }

  // ffmpeg WASM uses a virtual file system; mount input and read output
  const ffmpeg = await getFFmpeg();

  // Read video file into memory
  const videoData = fs.readFileSync(videoPath);

  // Write to ffmpeg virtual FS — use awemeId to avoid races on shared FS
  const inputName = `${awemeId}_input.mp4`;
  const outputName = `${awemeId}_output.wav`;
  await ffmpeg.writeFile(inputName, videoData);

  try {
    // Extract: -vn strips video stream, PCM 16KHz 16bit mono
    await ffmpeg.exec([
      "-i",
      inputName,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputName,
    ]);

    // Read result from virtual FS
    const audioData = (await ffmpeg.readFile(outputName)) as Uint8Array;

    // Write to disk
    fs.writeFileSync(outputPath, Buffer.from(audioData));
  } finally {
    // Cleanup virtual FS even on error
    try { await ffmpeg.deleteFile(inputName); } catch {}
    try { await ffmpeg.deleteFile(outputName); } catch {}
  }

  return outputPath;
}
