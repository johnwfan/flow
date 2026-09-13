-- Confirm `samples` is a hypertable
SELECT hypertable_name, num_dimensions
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'samples';

-- Confirm both continuous aggregates exist
SELECT view_name, materialization_hypertable_name
FROM timescaledb_information.continuous_aggregates
WHERE view_name IN ('samples_1min', 'samples_5min');

-- Confirm continuous aggregate refresh policies are scheduled
SELECT application_name, hypertable_name, config
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_refresh_continuous_aggregate'
  AND hypertable_name IN ('samples_1min', 'samples_5min');

-- Confirm compression is enabled on `samples`
SELECT hypertable_name, compression_enabled
FROM timescaledb_information.hypertables
WHERE hypertable_name = 'samples';

-- Confirm the compression policy job is scheduled
SELECT application_name, hypertable_name, config
FROM timescaledb_information.jobs
WHERE proc_name = 'policy_compression'
  AND hypertable_name = 'samples';

-- Confirm sessions/events/batch_keys tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('sessions', 'events', 'batch_keys', 'insight_reports');
