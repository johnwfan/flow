-- Stores the Gemini-generated "tips for next session" text alongside the
-- existing narrative, so it's generated once at session end (not
-- re-requested from Gemini on every dashboard page view). The raw
-- distraction stats (%, episodes, which apps) are cheap arithmetic over
-- already-stored data and are recomputed on read rather than stored.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tips TEXT;
