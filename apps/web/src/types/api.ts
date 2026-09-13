export interface StateRibbonSegment {
  state: string;
  startedAt: string;
  endedAt: string;
  durationS: number;
}

export interface SessionSummary {
  id: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  durationS: number | null;
  narrative: string | null;
  focusTimeS: number;
  stateRibbon: StateRibbonSegment[];
}

export interface TimelineBucket {
  bucket: string;
  avgPulseBpm: number | null;
  avgBreathingRpm: number | null;
  avgHrvMs: number | null;
  avgEdaUs: number | null;
  state: string;
}

export interface EventRow {
  ts: string;
  kind: string;
  payload: Record<string, unknown>;
}

export interface AppDistraction {
  appTitle: string | null;
  category: string | null;
  minutes: number;
  episodes: number;
  refocusMinutesAvg: number | null;
}

export interface DistractionWindow {
  startedAt: string;
  endedAt: string;
  durationS: number;
  appTitle: string | null;
  category: string | null;
}

export interface SessionInsights {
  distractionPct: number;
  zoneOutEpisodes: number;
  spiralEpisodes: number;
  distractionWindows: DistractionWindow[];
  distractingApps: AppDistraction[];
  tips: string | null;
}

export interface SessionDetail {
  summary: SessionSummary;
  timeline: TimelineBucket[];
  alerts: EventRow[];
  contexts: EventRow[];
  probes: EventRow[];
  insights: SessionInsights;
}

export interface FocusWindow {
  medianMinutes: number | null;
  decayCurve: { minute: number; pctStillFocused: number }[];
}

export interface SessionFocusPoint {
  sessionId: string;
  startedAt: string;
  pctFocused: number;
}

export interface CategoryEffort {
  category: string;
  minutes: number;
}

export interface SettlePoint {
  sessionId: string;
  date: string;
  settleSeconds: number | null;
}

export interface BreakQuality {
  restorative: number;
  depleting: number;
}

export interface InterventionEfficacyPoint {
  ts: string;
  breathingRpmBefore: number | null;
  breathingRpmAfter: number | null;
}

export interface ValidationResult {
  confusionMatrix: Record<string, Record<string, number>>;
  n: number;
  agreementRate: number;
  falseAlarmRate: number;
}

export interface DistractionPattern {
  appTitle: string | null;
  category: string | null;
  minutes: number;
  episodes: number;
  avgMinutesPerEpisode: number;
}

export interface Insights {
  focusWindow: FocusWindow;
  focusByTime: SessionFocusPoint[];
  effortByCategory: CategoryEffort[];
  settleTrend: SettlePoint[];
  breakQuality: BreakQuality;
  interventionEfficacy: InterventionEfficacyPoint[];
  validation: ValidationResult;
  distractionPatterns: DistractionPattern[];
}
