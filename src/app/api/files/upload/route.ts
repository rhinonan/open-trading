// POST /api/files/upload — multipart 文件上传
// 鉴权：requireAdmin（与写操作一致）
// 存储：data/files/{uuid}，返回 { id, url }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dataPath, ensureDataRoot } from "@/lib/data-root";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const FILES_DIR = dataPath("files");

function ensureFilesDir() {
  ensureDataRoot();
  if (!fs.existsSync(FILES_DIR)) {
    fs.mkdirSync(FILES_DIR, { recursive: true });
  }
}

export async function POST(request: Request) {
  const denied = requireAdmin(request);
  if (denied) return denied;

  ensureFilesDir();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field in multipart form data" },
      { status: 400 },
    );
  }

  // 保留原始扩展名（方便调试），用 uuid 防枚举
  const originalName = file.name || "audio.wav";
  const ext = path.extname(originalName) || ".wav";
  const id = crypto.randomUUID() + ext;

  const buffer = Buffer.from(await file.arrayBuffer());
  const destPath = path.join(FILES_DIR, id);
  fs.writeFileSync(destPath, buffer);

  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") || "http://localhost:3002";
  const url = `${publicBaseUrl}/api/files/${encodeURIComponent(id)}`;

  console.log(`  [files] 上传成功 id=${id} size=${buffer.length} url=${url}`);

  return NextResponse.json({ id, url }, { status: 201 });
}
