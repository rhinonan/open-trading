// src/app/api/settings/llm/route.ts
import {
  getLlmModel,
  setSetting,
  LLM_MODEL_KEYS,
} from "@/services/settings-service";

async function currentSettings() {
  const [opinionModel, evaluationModel, skillsReviewModel] = await Promise.all([
    getLlmModel("opinion"),
    getLlmModel("evaluation"),
    getLlmModel("skills-review"),
  ]);
  return { opinionModel, evaluationModel, skillsReviewModel };
}

export async function GET() {
  try {
    return Response.json(await currentSettings());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const body: { opinionModel?: unknown; evaluationModel?: unknown; skillsReviewModel?: unknown } =
      await request.json();

    for (const [field, value] of [
      ["opinionModel", body.opinionModel],
      ["evaluationModel", body.evaluationModel],
      ["skillsReviewModel", body.skillsReviewModel],
    ] as const) {
      if (
        value !== undefined &&
        (typeof value !== "string" || !value.trim())
      ) {
        return Response.json(
          { error: `${field} 必须是非空字符串` },
          { status: 400 }
        );
      }
    }

    if (typeof body.opinionModel === "string") {
      await setSetting(LLM_MODEL_KEYS.opinion, body.opinionModel.trim());
    }
    if (typeof body.evaluationModel === "string") {
      await setSetting(LLM_MODEL_KEYS.evaluation, body.evaluationModel.trim());
    }
    if (typeof body.skillsReviewModel === "string") {
      await setSetting(LLM_MODEL_KEYS["skills-review"], body.skillsReviewModel.trim());
    }

    return Response.json(await currentSettings());
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
