// src/app/api/douyin/works/route.ts
import { NextRequest } from "next/server";
import { queryWorks } from "@/services/douyin/works-service";
import type { WorksFilter } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const bloggerSlugsParam = searchParams.get("blogger_slugs");
    const filter: WorksFilter = {
      bloggerSlugs: bloggerSlugsParam
        ? bloggerSlugsParam.split(",").filter(Boolean)
        : undefined,
      transcriptStatus: searchParams.get("transcript_status") || undefined,
      judgment: searchParams.get("judgment") || undefined,
      search: searchParams.get("search") || undefined,
      page: parseInt(searchParams.get("page") || "0", 10) || 0,
      perPage: Math.min(
        50,
        parseInt(searchParams.get("perPage") || "20", 10) || 20
      ),
    };

    const result = await queryWorks(filter);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
