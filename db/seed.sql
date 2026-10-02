-- Adds sample centres and tests, only if there are no centres yet.
DO $$
DECLARE
  c1 INTEGER;
  c2 INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM centres) THEN
    INSERT INTO centres (name, location) VALUES ('CityCare Diagnostics', '12 MG Road') RETURNING id INTO c1;
    INSERT INTO centres (name, location) VALUES ('HealthFirst Labs', '45 Station Road') RETURNING id INTO c2;

    INSERT INTO diagnostic_tests (centre_id, name, price) VALUES
      (c1, 'Complete Blood Count', 350.00),
      (c1, 'Lipid Profile', 600.00),
      (c2, 'Thyroid Profile (T3, T4, TSH)', 750.00),
      (c2, 'HbA1c', 500.00);
  END IF;
END $$;
