ALTER TABLE datalogger_readings
  ADD COLUMN IF NOT EXISTS h NUMERIC;

-- Không dùng "ADD noi_dung_them IF NOT EXISTS" một mình: sau 005 cột đã đổi tên thành
-- additional_details, lần chạy migrate sau sẽ tạo *thêm* noi_dung_them và 005 sẽ va chạm tên cột.
DO $$
BEGIN
  IF NOT EXISTS (
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
    ALTER TABLE datalogger_readings ADD COLUMN noi_dung_them TEXT;
  END IF;
END $$;
