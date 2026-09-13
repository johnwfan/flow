CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  narrative TEXT,
  duration_s INTEGER
);

CREATE TABLE events (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions(id),
  ts TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL,
  payload JSONB
);

CREATE INDEX idx_events_session ON events (session_id, ts DESC);
