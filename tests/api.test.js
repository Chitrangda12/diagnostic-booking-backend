const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/db');

const webhookHeaders = () => ({
  'x-webhook-secret': process.env.WEBHOOK_SECRET,
});

const bearer = (token) => ({
  Authorization: `Bearer ${token}`,
});

const futureDate = () =>
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

let tokenA;
let tokenB;
let centre;
let diagTest;

async function createBooking(token = tokenA) {
  const res = await request(app)
    .post('/bookings')
    .set(bearer(token))
    .send({
      centre_id: centre.id,
      test_id: diagTest.id,
      appointment_at: futureDate(),
    });

  expect(res.status).toBe(201);
  return res.body;
}

async function paymentCount(bookingId) {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n FROM payments WHERE booking_id = $1',
    [bookingId]
  );

  return rows[0].n;
}

async function bookingStatus(bookingId) {
  const { rows } = await db.query(
    'SELECT status FROM bookings WHERE id = $1',
    [bookingId]
  );

  return rows[0].status;
}

beforeAll(async () => {
  const schema = fs.readFileSync(
    path.join(__dirname, '../db/schema.sql'),
    'utf8'
  );

  await db.query(schema);

  await db.query(
    'TRUNCATE users, centres, diagnostic_tests, bookings, payments, webhook_events RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await db.pool.end();
});

describe('Auth', () => {
  test('signup creates a user and returns a token', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'secret123',
      });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('alice@example.com');
    expect(res.body.user.password_hash).toBeUndefined();

    tokenA = res.body.token;

    const resB = await request(app)
      .post('/auth/signup')
      .send({
        name: 'Bob',
        email: 'bob@example.com',
        password: 'secret123',
      });

    expect(resB.status).toBe(201);
    tokenB = resB.body.token;
  });

  test('signup rejects duplicate email and invalid input', async () => {
    const dup = await request(app)
      .post('/auth/signup')
      .send({
        name: 'Alice 2',
        email: 'ALICE@example.com',
        password: 'secret123',
      });

    expect(dup.status).toBe(409);

    const bad = await request(app)
      .post('/auth/signup')
      .send({
        name: '',
        email: 'nope',
        password: '123',
      });

    expect(bad.status).toBe(400);
  });

  test('login works with correct password and fails with wrong password', async () => {
    const ok = await request(app)
      .post('/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'secret123',
      });

    expect(ok.status).toBe(200);
    expect(ok.body.token).toBeDefined();

    const wrong = await request(app)
      .post('/auth/login')
      .send({
        email: 'alice@example.com',
        password: 'wrong',
      });

    expect(wrong.status).toBe(401);

    const missing = await request(app)
      .post('/auth/login')
      .send({});

    expect(missing.status).toBe(400);
  });
});

describe('Unauthorized access', () => {
  test('protected routes reject missing and invalid tokens', async () => {
    expect((await request(app).get('/bookings')).status).toBe(401);

    expect(
      (await request(app).get('/bookings').set(bearer('not-a-real-token')))
        .status
    ).toBe(401);

    expect(
      (
        await request(app)
          .post('/centres')
          .send({ name: 'X', location: 'Y' })
      ).status
    ).toBe(401);

    expect(
      (
        await request(app)
          .post('/payments')
          .send({ booking_id: 1 })
      ).status
    ).toBe(401);
  });
});

describe('Centres and tests', () => {
  test('create and fetch a centre', async () => {
    const created = await request(app)
      .post('/centres')
      .set(bearer(tokenA))
      .send({
        name: 'CityCare',
        location: '12 MG Road',
      });

    expect(created.status).toBe(201);
    centre = created.body;

    const list = await request(app).get('/centres');

    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const one = await request(app).get(`/centres/${centre.id}`);

    expect(one.status).toBe(200);
    expect(one.body.name).toBe('CityCare');
  });

  test('invalid and unknown centre IDs', async () => {
    expect((await request(app).get('/centres/abc')).status).toBe(400);

    expect((await request(app).get('/centres/99999')).status).toBe(404);

    expect(
      (
        await request(app)
          .post('/centres')
          .set(bearer(tokenA))
          .send({ name: 'Only name' })
      ).status
    ).toBe(400);
  });

  test('create and fetch a diagnostic test', async () => {
    const created = await request(app)
      .post('/tests')
      .set(bearer(tokenA))
      .send({
        centre_id: centre.id,
        name: 'Blood Count',
        price: 350,
      });

    expect(created.status).toBe(201);
    expect(created.body.price).toBe(350);

    diagTest = created.body;

    expect((await request(app).get('/tests')).body).toHaveLength(1);

    expect(
      (await request(app).get(`/tests/${diagTest.id}`)).status
    ).toBe(200);

    expect((await request(app).get('/tests/xyz')).status).toBe(400);

    expect((await request(app).get('/tests/99999')).status).toBe(404);
  });

  test('test creation validates price and centre', async () => {
    const badPrice = await request(app)
      .post('/tests')
      .set(bearer(tokenA))
      .send({
        centre_id: centre.id,
        name: 'Free test',
        price: -5,
      });

    expect(badPrice.status).toBe(400);

    const noCentre = await request(app)
      .post('/tests')
      .set(bearer(tokenA))
      .send({
        centre_id: 99999,
        name: 'Ghost',
        price: 10,
      });

    expect(noCentre.status).toBe(404);
  });
});

describe('Bookings', () => {
  test('create a booking: starts PENDING and amount comes from the test price', async () => {
    const booking = await createBooking();

    expect(booking.status).toBe('PENDING');
    expect(booking.amount).toBe(350);
    expect(booking.user_id).toBeDefined();
  });

  test('rejects invalid bookings', async () => {
    const past = await request(app)
      .post('/bookings')
      .set(bearer(tokenA))
      .send({
        centre_id: centre.id,
        test_id: diagTest.id,
        appointment_at: '2000-01-01T10:00:00Z',
      });

    expect(past.status).toBe(400);

    const badDate = await request(app)
      .post('/bookings')
      .set(bearer(tokenA))
      .send({
        centre_id: centre.id,
        test_id: diagTest.id,
        appointment_at: 'tomorrow-ish',
      });

    expect(badDate.status).toBe(400);

    const noTest = await request(app)
      .post('/bookings')
      .set(bearer(tokenA))
      .send({
        centre_id: centre.id,
        test_id: 99999,
        appointment_at: futureDate(),
      });

    expect(noTest.status).toBe(404);
  });

  test('user sees only their own bookings', async () => {
    const mine = await request(app)
      .get('/bookings')
      .set(bearer(tokenA));

    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect(mine.body[0].centre_name).toBe('CityCare');

    const theirs = await request(app)
      .get('/bookings')
      .set(bearer(tokenB));

    expect(theirs.body).toHaveLength(0);
  });

  test('another user cannot view, cancel or pay for my booking', async () => {
    const booking = await createBooking();

    expect(
      (
        await request(app)
          .get(`/bookings/${booking.id}`)
          .set(bearer(tokenB))
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .patch(`/bookings/${booking.id}/cancel`)
          .set(bearer(tokenB))
      ).status
    ).toBe(403);

    expect(
      (
        await request(app)
          .post('/payments')
          .set(bearer(tokenB))
          .send({
            booking_id: booking.id,
            result: 'SUCCESS',
          })
      ).status
    ).toBe(403);

    expect(await bookingStatus(booking.id)).toBe('PENDING');
  });

  test('owner can view and cancel; cancelling twice gives 409; invalid IDs handled', async () => {
    const booking = await createBooking();

    expect(
      (
        await request(app)
          .get(`/bookings/${booking.id}`)
          .set(bearer(tokenA))
      ).status
    ).toBe(200);

    const cancelled = await request(app)
      .patch(`/bookings/${booking.id}/cancel`)
      .set(bearer(tokenA));

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    expect(
      (
        await request(app)
          .patch(`/bookings/${booking.id}/cancel`)
          .set(bearer(tokenA))
      ).status
    ).toBe(409);

    expect(
      (await request(app).get('/bookings/abc').set(bearer(tokenA))).status
    ).toBe(400);

    expect(
      (await request(app).get('/bookings/99999').set(bearer(tokenA))).status
    ).toBe(404);
  });
});

describe('Payments', () => {
  test('successful payment confirms the booking and cannot be repeated', async () => {
    const booking = await createBooking();

    const pay = await request(app)
      .post('/payments')
      .set(bearer(tokenA))
      .send({
        booking_id: booking.id,
        result: 'SUCCESS',
      });

    expect(pay.status).toBe(201);
    expect(pay.body.payment.status).toBe('SUCCESS');
    expect(pay.body.booking.status).toBe('CONFIRMED');

    const again = await request(app)
      .post('/payments')
      .set(bearer(tokenA))
      .send({
        booking_id: booking.id,
        result: 'SUCCESS',
      });

    expect(again.status).toBe(409);
    expect(await paymentCount(booking.id)).toBe(1);
  });

  test('failed payment marks the booking FAILED, and it can be retried', async () => {
    const booking = await createBooking();

    const failed = await request(app)
      .post('/payments')
      .set(bearer(tokenA))
      .send({
        booking_id: booking.id,
        result: 'FAILED',
      });

    expect(failed.status).toBe(201);
    expect(failed.body.payment.status).toBe('FAILED');
    expect(failed.body.booking.status).toBe('FAILED');

    const retry = await request(app)
      .post('/payments')
      .set(bearer(tokenA))
      .send({
        booking_id: booking.id,
        result: 'SUCCESS',
      });

    expect(retry.status).toBe(201);
    expect(retry.body.booking.status).toBe('CONFIRMED');
    expect(await paymentCount(booking.id)).toBe(2);
  });

  test('cannot pay a cancelled booking; bad input is rejected', async () => {
    const booking = await createBooking();

    await request(app)
      .patch(`/bookings/${booking.id}/cancel`)
      .set(bearer(tokenA));

    const pay = await request(app)
      .post('/payments')
      .set(bearer(tokenA))
      .send({
        booking_id: booking.id,
        result: 'SUCCESS',
      });

    expect(pay.status).toBe(409);

    expect(
      (
        await request(app)
          .post('/payments')
          .set(bearer(tokenA))
          .send({ booking_id: 'abc' })
      ).status
    ).toBe(400);

    expect(
      (
        await request(app)
          .post('/payments')
          .set(bearer(tokenA))
          .send({
            booking_id: booking.id,
            result: 'MAYBE',
          })
      ).status
    ).toBe(400);

    expect(
      (
        await request(app)
          .post('/payments')
          .set(bearer(tokenA))
          .send({
            booking_id: 99999,
            result: 'SUCCESS',
          })
      ).status
    ).toBe(404);
  });
});

describe('Payment webhook', () => {
  test('rejects a missing or wrong secret and invalid payloads', async () => {
    const booking = await createBooking();

    const body = {
      event_id: 'evt_auth_check',
      booking_id: booking.id,
      status: 'SUCCESS',
    };

    expect(
      (await request(app).post('/payments/webhook').send(body)).status
    ).toBe(401);

    expect(
      (
        await request(app)
          .post('/payments/webhook')
          .set('x-webhook-secret', 'wrong')
          .send(body)
      ).status
    ).toBe(401);

    const noEvent = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        booking_id: booking.id,
        status: 'SUCCESS',
      });

    expect(noEvent.status).toBe(400);

    const badStatus = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_bad_status',
        booking_id: booking.id,
        status: 'PAID',
      });

    expect(badStatus.status).toBe(400);
    expect(await bookingStatus(booking.id)).toBe('PENDING');
  });

  test('processes a SUCCESS event and confirms the booking', async () => {
    const booking = await createBooking();

    const res = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_success_1',
        booking_id: booking.id,
        status: 'SUCCESS',
        amount: 350,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('processed');
    expect(res.body.booking.status).toBe('CONFIRMED');
    expect(await paymentCount(booking.id)).toBe(1);
  });

  test('duplicate event_id does not create a second payment or change the booking', async () => {
    const booking = await createBooking();

    const body = {
      event_id: 'evt_dup_1',
      booking_id: booking.id,
      status: 'SUCCESS',
    };

    const first = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send(body);

    expect(first.body.status).toBe('processed');

    const second = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send(body);

    expect(second.status).toBe(200);
    expect(second.body.status).toBe('duplicate');

    // A duplicate event should be ignored even if its status is different.
    const third = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        ...body,
        status: 'FAILED',
      });

    expect(third.body.status).toBe('duplicate');

    expect(await paymentCount(booking.id)).toBe(1);
    expect(await bookingStatus(booking.id)).toBe('CONFIRMED');

    const { rows } = await db.query(
      "SELECT COUNT(*)::int AS n FROM webhook_events WHERE event_id = 'evt_dup_1'"
    );

    expect(rows[0].n).toBe(1);
  });

  test('many identical events sent at the same time are processed exactly once', async () => {
    const booking = await createBooking();

    const body = {
      event_id: 'evt_parallel_1',
      booking_id: booking.id,
      status: 'SUCCESS',
    };

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app)
          .post('/payments/webhook')
          .set(webhookHeaders())
          .send(body)
      )
    );

    expect(responses.every((r) => r.status === 200)).toBe(true);
    expect(
      responses.filter((r) => r.body.status === 'processed')
    ).toHaveLength(1);
    expect(
      responses.filter((r) => r.body.status === 'duplicate')
    ).toHaveLength(4);

    expect(await paymentCount(booking.id)).toBe(1);
  });

  test('a different event cannot flip a CONFIRMED booking to FAILED', async () => {
    const booking = await createBooking();

    await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_order_1',
        booking_id: booking.id,
        status: 'SUCCESS',
      });

    const late = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_order_2',
        booking_id: booking.id,
        status: 'FAILED',
      });

    expect(late.status).toBe(200);
    expect(late.body.status).toBe('ignored');

    expect(await bookingStatus(booking.id)).toBe('CONFIRMED');
    expect(await paymentCount(booking.id)).toBe(1);
  });

  test('FAILED event marks the booking FAILED; a later SUCCESS event confirms it', async () => {
    const booking = await createBooking();

    const failed = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_fail_1',
        booking_id: booking.id,
        status: 'FAILED',
      });

    expect(failed.body.booking.status).toBe('FAILED');

    const success = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_fail_2',
        booking_id: booking.id,
        status: 'SUCCESS',
      });

    expect(success.body.booking.status).toBe('CONFIRMED');
    expect(await paymentCount(booking.id)).toBe(2);
  });

  test('unknown booking returns 404 and the event is not remembered', async () => {
    const body = {
      event_id: 'evt_retry_1',
      booking_id: 99999,
      status: 'SUCCESS',
    };

    const res = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send(body);

    expect(res.status).toBe(404);

    const { rows } = await db.query(
      "SELECT COUNT(*)::int AS n FROM webhook_events WHERE event_id = 'evt_retry_1'"
    );

    expect(rows[0].n).toBe(0);
  });

  test('amount mismatch is rejected and a cancelled booking is left alone', async () => {
    const booking = await createBooking();

    const mismatch = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_amount_1',
        booking_id: booking.id,
        status: 'SUCCESS',
        amount: 1,
      });

    expect(mismatch.status).toBe(400);
    expect(await bookingStatus(booking.id)).toBe('PENDING');

    await request(app)
      .patch(`/bookings/${booking.id}/cancel`)
      .set(bearer(tokenA));

    const cancelled = await request(app)
      .post('/payments/webhook')
      .set(webhookHeaders())
      .send({
        event_id: 'evt_cancelled_1',
        booking_id: booking.id,
        status: 'SUCCESS',
      });

    expect(cancelled.body.status).toBe('ignored');
    expect(await bookingStatus(booking.id)).toBe('CANCELLED');
    expect(await paymentCount(booking.id)).toBe(0);
  });
});