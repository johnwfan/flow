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

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { deviceId?: string } }>("/v1/insights", async (request) => {
    const { deviceId } = request.query;

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
  });
}
