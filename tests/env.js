require('dotenv').config({ quiet: true });

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'Set TEST_DATABASE_URL in .env (use a separate database for tests).'
  );
}

if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL must be different from DATABASE_URL because tests clear the database.'
  );
}

process.env.NODE_ENV = 'test';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

process.env.WEBHOOK_SECRET =
  process.env.WEBHOOK_SECRET || 'test-webhook-secret';