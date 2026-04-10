CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  datalogger_code TEXT NOT NULL UNIQUE,
  name TEXT,
  area_code TEXT,
  pressure_max NUMERIC,
  pressure_min NUMERIC,
  lat NUMERIC,
  lon NUMERIC,
  meter_code TEXT,
  meter_type_name TEXT,
  meter_size_code TEXT,
  device_type TEXT,
  production_year TEXT,
  usage_year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_devices_area_code ON devices (area_code) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS datalogger_readings (
  device_id UUID NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
  "time" TIMESTAMPTZ NOT NULL,
  p NUMERIC NOT NULL,
  q NUMERIC NOT NULL
);

SELECT create_hypertable(
  'datalogger_readings',
  'time',
  if_not_exists => TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_readings_device_time ON datalogger_readings (device_id, "time");

CREATE INDEX IF NOT EXISTS idx_readings_device_time_desc ON datalogger_readings (device_id, "time" DESC);

ALTER TABLE datalogger_readings SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'device_id',
  timescaledb.compress_orderby = '"time" DESC'
);

SELECT add_compression_policy('datalogger_readings', INTERVAL '7 days', if_not_exists => TRUE);
