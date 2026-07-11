// src/app/api/douyin/bloggers/route.ts
import { NextRequest } from "next/server";
import * as bloggerService from "@/services/douyin/blogger-service";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") as
    | "pending"
    | "predictor"
    | "non_predictor"
    | null;

  try {
    const bloggers = await bloggerService.listBloggers(category || undefined);
    return Response.json(bloggers);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { douyinUid } = await request.json();
    if (!douyinUid || typeof douyinUid !== "string") {
      return Response.json(
        { error: "douyinUid is required" },
        { status: 400 }
      );
    }

    const blogger = await bloggerService.addBlogger(douyinUid);
    return Response.json(blogger, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal error";
    const status = message.includes("已存在") ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
