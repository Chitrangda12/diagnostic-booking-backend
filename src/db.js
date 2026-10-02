const { Pool, types } = require('pg');

// PostgreSQL NUMERIC values are returned as strings by default.
types.setTypeParser(1700, (value) => parseFloat(value));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected database error', err.message);
});

// Run a parameterized query.
function query(text, params) {
  return pool.query(text, params);
}

// Run multiple queries in one transaction.
async function withTransaction(fn) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await fn(client);

    await client.query('COMMIT');

    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
};