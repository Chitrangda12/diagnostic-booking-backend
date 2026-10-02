const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, asyncHandler, parseId, isNonEmptyString } = require('../utils');

const router = express.Router();

// GET /tests
// Optional: ?centre_id=1
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.query.centre_id !== undefined) {
      const centreId = parseId(req.query.centre_id);

      if (!centreId) {
        throw new HttpError(400, 'Invalid centre_id');
      }

      const { rows } = await db.query(
        `SELECT id, centre_id, name, price, created_at
         FROM diagnostic_tests
         WHERE centre_id = $1
         ORDER BY id`,
        [centreId]
      );

      return res.json(rows);
    }

    const { rows } = await db.query(
      `SELECT id, centre_id, name, price, created_at
       FROM diagnostic_tests
       ORDER BY id`
    );

    res.json(rows);
  })
);

// POST /tests
router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { centre_id, name, price } = req.body;

    const centreId = parseId(centre_id);

    if (!centreId) {
      throw new HttpError(400, 'centre_id must be a positive integer');
    }

    if (!isNonEmptyString(name, 150)) {
      throw new HttpError(400, 'name is required (max 150 characters)');
    }

    if (
      typeof price !== 'number' ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price >= 100000000
    ) {
      throw new HttpError(400, 'price must be a number greater than 0');
    }

    const centre = await db.query(
      'SELECT id FROM centres WHERE id = $1',
      [centreId]
    );

    if (centre.rows.length === 0) {
      throw new HttpError(404, 'Centre not found');
    }

    const { rows } = await db.query(
      `INSERT INTO diagnostic_tests (centre_id, name, price)
       VALUES ($1, $2, $3)
       RETURNING id, centre_id, name, price, created_at`,
      [centreId, name.trim(), price]
    );

    res.status(201).json(rows[0]);
  })
);

// GET /tests/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);

    if (!id) {
      throw new HttpError(400, 'Invalid test ID');
    }

    const { rows } = await db.query(
      `SELECT id, centre_id, name, price, created_at
       FROM diagnostic_tests
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      throw new HttpError(404, 'Test not found');
    }

    res.json(rows[0]);
  })
);

module.exports = router;