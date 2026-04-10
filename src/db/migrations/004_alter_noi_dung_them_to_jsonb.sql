ALTER TABLE datalogger_readings
  ALTER COLUMN noi_dung_them TYPE JSONB
  USING (
    CASE
      WHEN noi_dung_them IS NULL THEN NULL
      ELSE jsonb_build_object('text', noi_dung_them)
    END
  );
