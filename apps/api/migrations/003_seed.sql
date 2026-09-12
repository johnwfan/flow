-- Seed one fake device/session with 8 minutes of 1Hz samples and 3
-- non-contiguous context intervals (study, entertainment, study), to prove
-- the schema supports the "effort per category" query. See
-- scripts/verify-effort-query.ts for the aggregate refresh + query itself
-- (refresh_continuous_aggregate can't run inside this file's transaction).

INSERT INTO devices (device_id) VALUES ('seed-device-1')
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO sessions (id, device_id, label, started_at, ended_at)
VALUES ('00000000-0000-0000-0000-000000000001', 'seed-device-1', 'seed session',
        '2026-01-01 09:00:00+00', '2026-01-01 09:08:00+00')
ON CONFLICT (id) DO NOTHING;

-- 8 minutes @ 1Hz = 480 rows. Values vary slightly so categories aren't
-- numerically identical -- not physiologically meaningful, just non-degenerate.
INSERT INTO samples (ts, session_id, pulse_bpm, breathing_rpm, hrv_ms, eda_us, conf, blink, talking)
SELECT
  '2026-01-01 09:00:00+00'::timestamptz + (n * interval '1 second'),
  '00000000-0000-0000-0000-000000000001',
  70 + 5 * sin(n / 30.0),
  14 + 2 * sin(n / 45.0),
  60 - 10 * sin(n / 30.0),
  2 + 0.5 * sin(n / 20.0),
  0.85,
  'detected',
  'not_detected'
FROM generate_series(0, 479) AS n;

INSERT INTO context_intervals (time, session_id, app, category) VALUES
  ('2026-01-01 09:00:00+00', '00000000-0000-0000-0000-000000000001', 'vscode.exe', 'study'),
  ('2026-01-01 09:03:00+00', '00000000-0000-0000-0000-000000000001', 'youtube.com', 'entertainment'),
  ('2026-01-01 09:05:00+00', '00000000-0000-0000-0000-000000000001', 'vscode.exe', 'study');
