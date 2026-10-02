const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { HttpError, asyncHandler, parseId, isNonEmptyString } = require('../utils');

const router = express.Router();

const RESULTS = ['SUCCESS', 'FAILED'];
const PAYABLE_STATUSES = ['PENDING', 'FAILED'];

const bookingStatusFor = (result) => (result === 'SUCCESS' ? 'CONFIRMED' : 'FAILED');

// POST /payments
router.post(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const bookingId = parseId(req.body.booking_id);
    if (!bookingId) {
      throw new HttpError(400, 'booking_id must be a positive integer');
    }

    let result = req.body.result;
    if (result === undefined) {
      result = Math.random() < 0.8 ? 'SUCCESS' : 'FAILED';
    }

    if (!RESULTS.includes(result)) {
      throw new HttpError(400, 'result must be SUCCESS or FAILED');
    }

    const outcome = await db.withTransaction(async (client) => {
      // Lock the booking while processing the payment.
      const { rows } = await client.query(
        'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
        [bookingId]
      );

      const booking = rows[0];

      if (!booking) {
        throw new HttpError(404, 'Booking not found');
      }

      if (booking.user_id !== req.user.id) {
        throw new HttpError(403, 'You do not have access to this booking');
      }

      if (!PAYABLE_STATUSES.includes(booking.status)) {
        throw new HttpError(
          409,
          `Booking is ${booking.status} and cannot be paid`
        );
      }

      const payment = await client.query(
        `INSERT INTO payments (booking_id, amount, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [booking.id, booking.amount, result]
      );

      const updated = await client.query(
        `UPDATE bookings
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [bookingStatusFor(result), booking.id]
      );

      return {
        payment: payment.rows[0],
        booking: updated.rows[0],
      };
    });

    res.status(201).json(outcome);
  })
);

// POST /payments/webhook
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    if (
      !process.env.WEBHOOK_SECRET ||
      req.get('x-webhook-secret') !== process.env.WEBHOOK_SECRET
    ) {
      throw new HttpError(401, 'Invalid webhook secret');
    }

    const { event_id, booking_id, status, amount } = req.body;

    if (!isNonEmptyString(event_id, 255)) {
      throw new HttpError(400, 'event_id is required (max 255 characters)');
    }

    const bookingId = parseId(booking_id);
    if (!bookingId) {
      throw new HttpError(400, 'booking_id must be a positive integer');
    }

    if (!RESULTS.includes(status)) {
      throw new HttpError(400, 'status must be SUCCESS or FAILED');
    }

    if (
      amount !== undefined &&
      (typeof amount !== 'number' || !Number.isFinite(amount))
    ) {
      throw new HttpError(400, 'amount must be a number');
    }

    const eventId = event_id.trim();

    const outcome = await db.withTransaction(async (client) => {
      // Store each webhook event only once.
      const claim = await client.query(
        `INSERT INTO webhook_events (event_id, payload)
         VALUES ($1, $2)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING id`,
        [eventId, JSON.stringify(req.body)]
      );

      if (claim.rowCount === 0) {
        return { status: 'duplicate' };
      }

      // Lock the booking while processing the webhook.
      const { rows } = await client.query(
        'SELECT * FROM bookings WHERE id = $1 FOR UPDATE',
        [bookingId]
      );

      const booking = rows[0];

      if (!booking) {
        throw new HttpError(404, 'Booking not found');
      }

      if (
        amount !== undefined &&
        Number(amount) !== Number(booking.amount)
      ) {
        throw new HttpError(400, 'amount does not match the booking amount');
      }

      if (!PAYABLE_STATUSES.includes(booking.status)) {
        return {
          status: 'ignored',
          booking,
        };
      }

      const payment = await client.query(
        `INSERT INTO payments (booking_id, amount, status, event_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [booking.id, booking.amount, status, eventId]
      );

      const updated = await client.query(
        `UPDATE bookings
         SET status = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [bookingStatusFor(status), booking.id]
      );

      return {
        status: 'processed',
        payment: payment.rows[0],
        booking: updated.rows[0],
      };
    });

    if (outcome.status === 'duplicate') {
      return res.json({
        received: true,
        status: 'duplicate',
        message: 'Event already processed',
      });
    }

    if (outcome.status === 'ignored') {
      return res.json({
        received: true,
        status: 'ignored',
        message: `Booking is ${outcome.booking.status}, so it was not changed`,
        booking: outcome.booking,
      });
    }

    res.json({
      received: true,
      status: 'processed',
      payment: outcome.payment,
      booking: outcome.booking,
    });
  })
);

module.exports = router;