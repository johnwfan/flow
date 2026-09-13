CREATE MATERIALIZED VIEW samples_1min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', ts) AS bucket,
  session_id,
  avg(pulse_bpm) AS avg_pulse_bpm,
  avg(breathing_rpm) AS avg_breathing_rpm,
  avg(hrv_ms) AS avg_hrv_ms,
  avg(eda_us) AS avg_eda_us,
  count(*) AS sample_count,
  last(state, ts) AS state,
  last(category, ts) AS category,
  last(app_title, ts) AS app_title
FROM samples
GROUP BY bucket, session_id
WITH NO DATA;

CREATE MATERIALIZED VIEW samples_5min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('5 minutes', ts) AS bucket,
  session_id,
  avg(pulse_bpm) AS avg_pulse_bpm,
  avg(breathing_rpm) AS avg_breathing_rpm,
  avg(hrv_ms) AS avg_hrv_ms,
  avg(eda_us) AS avg_eda_us,
  count(*) AS sample_count,
  last(state, ts) AS state,
  last(category, ts) AS category,
  last(app_title, ts) AS app_title
FROM samples
GROUP BY bucket, session_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('samples_1min',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');

SELECT add_continuous_aggregate_policy('samples_5min',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes');
