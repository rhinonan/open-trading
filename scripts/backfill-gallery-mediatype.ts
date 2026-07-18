// scripts/backfill-gallery-mediatype.ts
// 回填：迁移前入库的图集记录 mediaType 默认为 4，但实际是图集 (2)
// 识别方式: videoUrl IS NULL AND duration = 0（图集无视频对象）
import { db } from "@/db";
import { works } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

const result = db
  .update(works)
  .set({ mediaType: 2 })
  .where(
    and(
      isNull(works.videoUrl),
      eq(works.duration, 0),
      eq(works.mediaType, 4) // only fix misclassified records
    )
  )
  .run();

console.log(`Backfilled ${result.changes} gallery records (mediaType 4→2)`);
