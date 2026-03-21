CREATE TABLE usage_events (
  timestamp TEXT,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  total_tokens INTEGER
);

INSERT INTO usage_events (timestamp, provider, model, input_tokens, output_tokens, cache_read_tokens, total_tokens)
VALUES ('2026-03-20T10:15:00Z', 'synthetic', 'synthetic/deepseek-r1', 111, 29, 9, 149);
