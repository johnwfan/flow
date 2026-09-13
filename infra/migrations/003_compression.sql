ALTER TABLE samples SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'session_id',
  timescaledb.compress_orderby = 'ts DESC'
);

SELECT add_compression_policy('samples', INTERVAL '1 day');
