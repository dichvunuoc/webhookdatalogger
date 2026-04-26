-- Idempotent: sau 005 cột đã là additional_details; chạy lại khi start container không được lỗi.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'datalogger_readings'
      AND column_name = 'noi_dung_them'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE datalogger_readings
      ALTER COLUMN noi_dung_them TYPE JSONB
      USING (
        CASE
          WHEN noi_dung_them IS NULL THEN NULL
          ELSE jsonb_build_object('text', noi_dung_them)
        END
      );
  END IF;
END $$;
