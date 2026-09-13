CREATE TABLE samples (
  id BIGSERIAL,
  session_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL,
  pulse_bpm REAL,
  breathing_rpm REAL,
  hrv_ms REAL,
  eda_us REAL,
  conf REAL,
  blink TEXT,
  talking TEXT,
  state TEXT NOT NULL,
  category TEXT,
  app_title TEXT
);

SELECT create_hypertable('samples', 'ts');

CREATE INDEX idx_samples_session ON samples (session_id, ts DESC);
CREATE INDEX idx_samples_device ON samples (device_id, ts DESC);
