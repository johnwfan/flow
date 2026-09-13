-- Tightens the continuous aggregate refresh cadence so a session's data
-- shows up on the dashboard within seconds of a batch landing, rather than
-- the original 1min/5min policy (which could leave the most recent 1-2
-- minutes of a just-ended session showing an empty timeline/state ribbon).
--
-- Trade-off: refreshing every 10s costs more background DB work than every
-- 1min. Fine at hackathon single-user scale; revisit if this ever runs
-- with many concurrent devices.

SELECT remove_continuous_aggregate_policy('samples_1min');
SELECT add_continuous_aggregate_policy('samples_1min',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '10 seconds',
  schedule_interval => INTERVAL '10 seconds');

SELECT remove_continuous_aggregate_policy('samples_5min');
SELECT add_continuous_aggregate_policy('samples_5min',
  start_offset => INTERVAL '1 hour',
  end_offset => INTERVAL '30 seconds',
  schedule_interval => INTERVAL '30 seconds');
