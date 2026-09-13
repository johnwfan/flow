import type { FastifyInstance } from "fastify";
import {
  computeBreakQuality,
  computeEffortByCategory,
  computeFocusWindow,
  computeInterventionEfficacy,
  computeSettleTrend,
  computeValidation,
} from "../lib/insights.js";

export async function insightsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { deviceId?: string } }>("/v1/insights", async (request) => {
    const { deviceId } = request.query;

    const [focusWindow, effortByCategory, settleTrend, breakQuality, interventionEfficacy, validation] =
      await Promise.all([
        computeFocusWindow(app.pg, deviceId),
        computeEffortByCategory(app.pg, deviceId),
        computeSettleTrend(app.pg, deviceId),
        computeBreakQuality(app.pg, deviceId),
        computeInterventionEfficacy(app.pg, deviceId),
        computeValidation(app.pg, deviceId),
      ]);

    return { focusWindow, effortByCategory, settleTrend, breakQuality, interventionEfficacy, validation };
  });
}
