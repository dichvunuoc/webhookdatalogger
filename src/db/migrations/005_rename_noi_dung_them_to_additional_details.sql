DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'datalogger_readings'
      AND column_name = 'noi_dung_them'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'datalogger_readings'
      AND column_name = 'additional_details'
  ) THEN
    ALTER TABLE datalogger_readings RENAME COLUMN noi_dung_them TO additional_details;
  END IF;
END $$;
