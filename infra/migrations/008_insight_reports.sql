-- Stores Gemini-authored cross-session insight boards so the Insights page
-- can show a real AI read without calling Gemini on every page load.
CREATE TABLE IF NOT EXISTS insight_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  device_id TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prompt_version TEXT NOT NULL,
  data_fingerprint TEXT NOT NULL,
  session_count INTEGER NOT NULL,
  source TEXT NOT NULL,
  content JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_insight_reports_scope_generated
ON insight_reports (scope_key, generated_at DESC);
