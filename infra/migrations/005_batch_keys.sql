CREATE TABLE batch_keys (
  session_id UUID NOT NULL,
  batch_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, batch_key)
);
