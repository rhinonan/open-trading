# Final Fix Report — 10 Verified Review Findings

**Date:** 2026-07-12
**Branch:** main
**Status:** All fixes applied and type-checked clean (`npx tsc --noEmit` passed)

---

## Summary

| # | Severity | File | Issue | Fix |
|---|----------|------|-------|-----|
| 1 | Critical | pipeline-service.ts:113 | catch db.update throw leaves row stuck "processing" | Wrapped db.update in inner try/catch |
| 2 | Critical | audio-extractor.ts:94 | finally deleteFile masks original error | Wrapped each deleteFile in its own try/catch |
| 3 | Important | cleanup.ts:8 | falsy-zero VIDEO_RETENTION_DAYS=0 | Used explicit isNaN check instead of `\|\|` fallback |
| 4 | Important | pipeline-service.ts:85 | crash mid-pipeline leaves rows stuck "processing" | Added "processing" to WHERE IN clause |
| 5 | Important | pipeline-service.ts:97 | duration=0 misroutes to IAT short-audio | Default to 61s (LFASR path) when duration=0 |
| 6 | Important | video-downloader.ts:56 | fetchOneVideo exception wastes retries | Wrapped fetchOneVideo in try/catch, throws terminal error |
| 7 | Important | transcriber.ts:10 | WAV_HEADER_SIZE=44 fragile | Replaced with findWavDataOffset() RIFF parser |
| 8 | Efficiency | pipeline-service.ts:126 | failed works retried infinitely | Changed WHERE IN to only "pending" + "processing" |
| 9 | Efficiency | video-downloader.ts:69 | full-buffer download | Replaced with streaming write to disk |
| 10 | Correctness | page.tsx:318 | JSON.parse without try/catch | Wrapped JSON.parse in try/catch with empty fallback |

---

## Details

### Finding 1 [Critical] — pipeline-service.ts catch db.update throw

**File:** `src/services/douyin/pipeline-service.ts` ~line 113

The catch block's `db.update(...).set({transcriptStatus:"failed"}).run()` could itself throw, leaving the row stuck in "processing" forever. Wrapped in inner try/catch that logs the DB error without letting it escape.

### Finding 2 [Critical] — audio-extractor.ts finally deleteFile masks error

**File:** `src/services/douyin/audio-extractor.ts` ~line 91-95

When `ffmpeg.exec()` failed, `outputName` was never created, so `deleteFile(outputName)` threw ENOENT, replacing the original error. Wrapped each `deleteFile` in its own empty catch block.

### Finding 3 [Important] — cleanup.ts falsy-zero

**File:** `scripts/cleanup.ts` ~line 8

`parseInt("0") || 7` evaluated to 7 because 0 is falsy. Replaced with explicit `isNaN()` check.

### Finding 4 [Important] — pipeline-service rows stuck "processing"

**File:** `src/services/douyin/pipeline-service.ts` ~line 141

Added "processing" to the WHERE IN clause so rows stuck after a crash get retried on next pipeline run.

### Finding 5 [Important] — duration=0 misroutes to IAT

**File:** `src/services/douyin/pipeline-service.ts` ~line 97

When API returned duration=0, the IAT path was selected even for long videos. Now defaults to 61,000ms (LFASR path) when duration <= 0.

### Finding 6 [Important] — video-downloader fetchOneVideo exception

**File:** `src/services/douyin/video-downloader.ts` ~line 56

When `fetchOneVideo` threw inside the 403/404 handler, execution jumped to the outer catch which retried with the same expired URL. Now wrapped in try/catch that throws a terminal error.

### Finding 7 [Important] — transcriber WAV_HEADER_SIZE fragile

**File:** `src/services/douyin/transcriber.ts` ~line 10

Hardcoded 44-byte header strip fails on WAV files with extended chunks. Replaced with `findWavDataOffset()` that parses the actual RIFF chunk structure.

### Finding 8 [Efficiency] — failed works retried infinitely

**File:** `src/services/douyin/pipeline-service.ts` ~line 141

Removed "failed" from WHERE IN clause (was `["pending", "failed"]`, now `["pending", "processing"]`). Failed works need manual intervention.

### Finding 9 [Efficiency] — full-buffer video download

**File:** `src/services/douyin/video-downloader.ts` ~line 69

Replaced `Buffer.from(await res.arrayBuffer())` with streaming via `res.body!.getReader()` + `fs.createWriteStream`, avoiding full video buffer in RAM.

### Finding 10 [Correctness] — page.tsx JSON.parse crash

**File:** `src/app/sentiment/douyin/[id]/page.tsx` ~line 318

Wrapped `JSON.parse(work.statistics || "{}")` in try/catch with empty stats fallback on parse failure.

---

## Verification

```
npx tsc --noEmit
```
Result: **0 errors** — all types check cleanly.

## Files Changed

| File | Changes |
|------|---------|
| `src/services/douyin/pipeline-service.ts` | 4 edits (Findings 1, 4, 5, 8) |
| `src/services/douyin/audio-extractor.ts` | 1 edit (Finding 2) |
| `scripts/cleanup.ts` | 1 edit (Finding 3) |
| `src/services/douyin/video-downloader.ts` | 2 edits (Findings 6, 9) |
| `src/services/douyin/transcriber.ts` | 2 edits (Finding 7) |
| `src/app/sentiment/douyin/[id]/page.tsx` | 1 edit (Finding 10) |
