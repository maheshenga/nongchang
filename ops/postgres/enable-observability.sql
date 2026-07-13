CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

ALTER SYSTEM SET track_io_timing = 'on';
ALTER SYSTEM SET log_min_duration_statement = '1000ms';

SELECT pg_reload_conf();
