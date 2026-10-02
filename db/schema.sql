-- Safe to run more than once (IF NOT EXISTS everywhere).

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100)  NOT NULL,
  email         VARCHAR(255)  NOT NULL UNIQUE,
  password_hash VARCHAR(100)  NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS centres (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(150) NOT NULL,
  location   VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diagnostic_tests (
  id         SERIAL PRIMARY KEY,
  centre_id  INTEGER       NOT NULL REFERENCES centres(id) ON DELETE CASCADE,
  name       VARCHAR(150)  NOT NULL,
  price      NUMERIC(10,2) NOT NULL CHECK (price > 0),
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER       NOT NULL REFERENCES users(id),
  centre_id      INTEGER       NOT NULL REFERENCES centres(id),
  test_id        INTEGER       NOT NULL REFERENCES diagnostic_tests(id),
  appointment_at TIMESTAMPTZ   NOT NULL,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status         VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED')),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id         SERIAL PRIMARY KEY,
  booking_id INTEGER       NOT NULL REFERENCES bookings(id),
  amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  status     VARCHAR(10)   NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  event_id   VARCHAR(255)  UNIQUE,   -- set only for payments created by a webhook
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- One row per webhook event we have processed. UNIQUE event_id = idempotency.
CREATE TABLE IF NOT EXISTS webhook_events (
  id         SERIAL PRIMARY KEY,
  event_id   VARCHAR(255) NOT NULL UNIQUE,
  payload    JSONB        NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id     ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id  ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_tests_centre_id      ON diagnostic_tests(centre_id);
