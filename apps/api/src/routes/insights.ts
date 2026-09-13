import type { FastifyInstance } from "fastify";
import {
  computeBreakQuality,
  computeEffortByCategory,
  computeFocusByTime,
  computeFocusWindow,
  computeInterventionEfficacy,
  computeSettleTrend,
  computeValidation,
} from "../lib/insights.js";
import { computeCrossSessionDistractionPattern } from "../lib/sessionInsights.js";
import {
  generateAndStoreAiInsightReport,
  getOrCreateAiInsightReport,
  type ComputedInsights,
} from "../lib/aiInsights.js";

async function computeInsights(app: FastifyInstance, deviceId?: string): Promise<ComputedInsights> {
    const [
      focusWindow,
      focusByTime,
      effortByCategory,
      settleTrend,
      breakQuality,
      interventionEfficacy,
      validation,
      distractionPatterns,
    ] = await Promise.all([
      computeFocusWindow(app.pg, deviceId),
      computeFocusByTime(app.pg, deviceId),
      computeEffortByCategory(app.pg, deviceId),
      computeSettleTrend(app.pg, deviceId),
      computeBreakQuality(app.pg, deviceId),
      computeInterventionEfficacy(app.pg, deviceId),
      computeValidation(app.pg, deviceId),
      computeCrossSessionDistractionPattern(app.pg, deviceId),
    ]);

    return {
      focusWindow,
      focusByTime,
      effortByCategory,
      settleTrend,
      breakQuality,
      interventionEfficacy,
      validation,
      distractionPatterns,
    };
}

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { deviceId?: string } }>("/v1/insights", async (request) => {
    const { deviceId } = request.query;
    const insights = await computeInsights(app, deviceId);
    const aiReport = await getOrCreateAiInsightReport(app.pg, deviceId, insights);

    return {
      ...insights,
      aiReport,
    };
  });

  app.post<{ Querystring: { deviceId?: string } }>("/v1/insights/regenerate", async (request) => {
    const { deviceId } = request.query;
    const insights = await computeInsights(app, deviceId);
    const aiReport = await generateAndStoreAiInsightReport(app.pg, deviceId, insights);

    return { aiReport };
  });
}
