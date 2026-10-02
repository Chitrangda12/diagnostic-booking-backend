const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, asyncHandler, parseId } = require('../utils');

const router = express.Router();

// Booking + centre name + test name, used by the list and get-by-id endpoints.
const BOOKING_SELECT = `
  SELECT b.id, b.user_id, b.centre_id, c.name AS centre_name,
         b.test_id, t.name AS test_name,
         b.appointment_at, b.amount, b.status, b.created_at, b.updated_at
  FROM bookings b
  JOIN centres c ON c.id = b.centre_id
  JOIN diagnostic_tests t ON t.id = b.test_id`;

// All booking routes need a logged-in user.
router.use(auth);

// POST /bookings
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { centre_id, test_id, appointment_at } = req.body;

    const centreId = parseId(centre_id);
    const testId = parseId(test_id);
    if (!centreId) throw new HttpError(400, 'centre_id must be a positive integer');
    if (!testId) throw new HttpError(400, 'test_id must be a positive integer');

    const appointment = typeof appointment_at === 'string' ? new Date(appointment_at) : null;
    if (!appointment || Number.isNaN(appointment.getTime())) {
      throw new HttpError(400, 'appointment_at must be a valid date/time, e.g. 2030-01-15T10:30:00Z');
    }
    if (appointment <= new Date()) {
      throw new HttpError(400, 'appointment_at must be in the future');
    }

    const { rows: tests } = await db.query('SELECT id, centre_id, price FROM diagnostic_tests WHERE id = $1', [
      testId,
    ]);
    const test = tests[0];
    if (!test) throw new HttpError(404, 'Test not found');
    if (test.centre_id !== centreId) throw new HttpError(400, 'This test is not offered at the given centre');

    // The amount always comes from the test price, never from the client.
    const { rows } = await db.query(
      `INSERT INTO bookings (user_id, centre_id, test_id, appointment_at, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, centreId, testId, appointment.toISOString(), test.price]
    );
    res.status(201).json(rows[0]);
  })
);

// GET /bookings  (only the logged-in user's bookings)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(`${BOOKING_SELECT} WHERE b.user_id = $1 ORDER BY b.id DESC`, [req.user.id]);
    res.json(rows);
  })
);

// GET /bookings/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid booking ID');

    const { rows } = await db.query(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
    const booking = rows[0];
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.user_id !== req.user.id) throw new HttpError(403, 'You do not have access to this booking');

    res.json(booking);
  })
);

// PATCH /bookings/:id/cancel
router.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) throw new HttpError(400, 'Invalid booking ID');

    // Update only the user's booking if it is not already cancelled.
    const { rows } = await db.query(
      `UPDATE bookings SET status = 'CANCELLED', updated_at = NOW()
       WHERE id = $1 AND user_id = $2 AND status <> 'CANCELLED'
       RETURNING *`,
      [id, req.user.id]
    );
    if (rows.length > 0) return res.json(rows[0]);

    // Nothing updated - find out why so we can return the right error.
    const { rows: existing } = await db.query('SELECT user_id FROM bookings WHERE id = $1', [id]);
    if (existing.length === 0) throw new HttpError(404, 'Booking not found');
    if (existing[0].user_id !== req.user.id) throw new HttpError(403, 'You do not have access to this booking');
    throw new HttpError(409, 'Booking is already cancelled');
  })
);

module.exports = router;
