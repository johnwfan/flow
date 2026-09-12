-- Dashboard workhorse: per-session, per-minute rollup of the hypertable so
-- reads never scan raw 20Hz samples.
CREATE MATERIALIZED VIEW samples_1m
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', ts) AS bucket,
  session_id,
  avg(pulse_bpm)     AS avg_pulse_bpm,
  avg(breathing_rpm) AS avg_breathing_rpm,
  avg(hrv_ms)        AS avg_hrv_ms,
  avg(eda_us)        AS avg_eda_us,
  avg(conf)          AS avg_conf,
  count(*)           AS n_samples
FROM samples
GROUP BY bucket, session_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('samples_1m',
  start_offset      => INTERVAL '1 hour',
  end_offset        => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute');
