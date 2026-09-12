CREATE TABLE devices (
  device_id  TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id  TEXT NOT NULL REFERENCES devices(device_id),
  label      TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at   TIMESTAMPTZ,
  narrative  TEXT
);
CREATE INDEX idx_sessions_device ON sessions (device_id, started_at DESC);

-- High-frequency (20Hz), append-only hypertable. Columns match SampleMessage
-- in packages/shared/src/types.ts (landmarks/expressions deliberately omitted —
-- not read by any insight query, would dominate row size at 20Hz).
CREATE TABLE samples (
  ts            TIMESTAMPTZ NOT NULL,
  session_id    UUID NOT NULL REFERENCES sessions(id),
  pulse_bpm     REAL,
  breathing_rpm REAL,
  hrv_ms        REAL,
  eda_us        REAL,
  conf          REAL,
  blink         TEXT CHECK (blink   IN ('detected','not_detected','unknown')),
  talking       TEXT CHECK (talking IN ('detected','not_detected','unknown'))
);
SELECT create_hypertable('samples', 'ts');
CREATE INDEX idx_samples_session_ts ON samples (session_id, ts DESC);

-- One row per AppContextMessage (point event, not a precomputed interval).
CREATE TABLE context_intervals (
  time       TIMESTAMPTZ NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id),
  app        TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN
    ('study','social','entertainment','productivity','communication','system','unknown'))
);
CREATE INDEX idx_context_intervals_session_time ON context_intervals (session_id, time);

-- One row per StateMessage (point event).
CREATE TABLE states (
  since      TIMESTAMPTZ NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id),
  state      TEXT NOT NULL CHECK (state IN
    ('focused','zoned_out','spiraling','no_signal','warmup')),
  confidence REAL,
  reasons    TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_states_session_since ON states (session_id, since);

-- One row per AlertMessage. response has no dedicated wire message in the
-- current contract; it's a nullable column populated via the batch endpoint.
CREATE TABLE alerts (
  time       TIMESTAMPTZ NOT NULL,
  session_id UUID NOT NULL REFERENCES sessions(id),
  kind       TEXT NOT NULL CHECK (kind IN ('zone_out','spiral')),
  reasons    TEXT[] NOT NULL DEFAULT '{}',
  duration_s REAL,
  response   TEXT
);
CREATE INDEX idx_alerts_session_time ON alerts (session_id, time);

-- ThoughtProbeMessage carries ts/classifier_state/user_response together, so
-- one insert populates predicted_state + answer at once.
CREATE TABLE probes (
  probe_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id),
  time            TIMESTAMPTZ NOT NULL,
  predicted_state TEXT CHECK (predicted_state IN
    ('focused','zoned_out','spiraling','no_signal','warmup')),
  answer          TEXT
);
CREATE INDEX idx_probes_session_time ON probes (session_id, time);

-- Idempotency ledger for POST /v1/sessions/:id/batch (Phase 5).
CREATE TABLE processed_batches (
  session_id   UUID NOT NULL REFERENCES sessions(id),
  batch_key    TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, batch_key)
);
