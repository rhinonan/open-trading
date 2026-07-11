// src/services/douyin/transcriber.ts

/**
 * Transcribe audio from a Douyin video URL.
 *
 * PLACEHOLDER: Currently throws. Implement by calling your chosen
 * cloud ASR provider (Aliyun / Tencent / Xunfei / etc.) once you've
 * compared pricing and quality.
 *
 * Expected flow once implemented:
 *   1. Download the video from videoUrl
 *   2. Extract audio track (ffmpeg or similar)
 *   3. Upload audio to ASR provider
 *   4. Return transcribed text
 */
export async function transcribeAudio(videoUrl: string): Promise<string> {
  throw new Error(
    `ASR not configured. Tried to transcribe: ${videoUrl}. ` +
      `Set ASR_API_KEY / ASR_API_SECRET env and implement the adapter in ` +
      `src/services/douyin/transcriber.ts.`
  );
}

/**
 * Batch transcribe multiple videos. Returns a Map of awemeId → transcript.
 * Failed transcriptions have empty string values.
 */
export async function transcribeBatch(
  videos: Array<{ awemeId: string; videoUrl: string }>
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const { awemeId, videoUrl } of videos) {
    try {
      const text = await transcribeAudio(videoUrl);
      results.set(awemeId, text);
    } catch {
      // Leave as empty string for failed transcriptions
      results.set(awemeId, "");
    }
  }

  return results;
}
