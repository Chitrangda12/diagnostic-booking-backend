const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, asyncHandler, parseId, isNonEmptyString } = require('../utils');

const router = express.Router();

// GET /centres (public)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query('SELECT id, name, location, created_at FROM centres ORDER BY id');
    res.json(rows);
  })
);

// POST /centres (login required)
router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { name, location } = req.body;
    if (!isNonEmptyString(name, 150)) throw new HttpError(400, 'name is required (max 150 characters)');
    if (!isNonEmptyString(location, 255)) throw new HttpError(400, 'location is required (max 255 characters)');

    const { rows } = await db.query(
      'INSERT INTO centres (name, location) VALUES ($1, $2) RETURNING id, name, location, created_at',
      [name.trim(), location.trim()]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /centres/:id (public)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid centre ID');

    const { rows } = await db.query('SELECT id, name, location, created_at FROM centres WHERE id = $1', [id]);
    if (rows.length === 0) throw new HttpError(404, 'Centre not found');
    res.json(rows[0]);
  })
);

module.exports = router;
