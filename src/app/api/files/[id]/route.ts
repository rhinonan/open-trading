// GET  /api/files/[id] — 公开下载文件（百炼拉音频用，无需鉴权）
// DELETE /api/files/[id] — 删除文件（需 admin 鉴权）
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dataPath } from "@/lib/data-root";
import * as fs from "fs";
import * as path from "path";

const FILES_DIR = dataPath("files");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // 防止路径穿越：id 只能是纯文件名
  const safeName = path.basename(id);
  if (safeName !== id) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const filePath = path.join(FILES_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const stat = fs.statSync(filePath);
  const ext = path.extname(safeName).toLowerCase();

  // 常见音频/视频 MIME
  const mimeMap: Record<string, string> = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
    ".mp4": "video/mp4",
    ".mkv": "video/x-matroska",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  const stream = fs.createReadStream(filePath);

  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "no-cache",
    },
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const safeName = path.basename(id);
  if (safeName !== id) {
    return NextResponse.json({ error: "Invalid file id" }, { status: 400 });
  }

  const filePath = path.join(FILES_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  try {
    fs.unlinkSync(filePath);
    console.log(`  [files] 已删除 id=${safeName}`);
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to delete file: ${String(e)}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
