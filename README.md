# Diagnostic Booking & Payment Backend

A backend service for booking diagnostic tests and handling simulated payments.

## Tech Stack

- Node.js
- Express.js
- PostgreSQL
- pg
- JWT
- bcryptjs
- Jest
- Supertest

## Project Structure

```text
db/
  schema.sql
  seed.sql

scripts/
  run-sql.js

src/
  server.js
  app.js
  db.js
  utils.js
  middleware/
  routes/

tests/

postman_collection.json
.env.example
package.json
README.md
```

## Setup

### Requirements

- Node.js 18+
- PostgreSQL

Install the dependencies:

```bash
npm install
```

Create two PostgreSQL databases:

```text
diagnostic_booking
diagnostic_booking_test
```

Create a `.env` file using `.env.example` and update the database credentials and secrets.

Run the database setup:

```bash
npm run db:setup
```

Optional sample data:

```bash
npm run db:seed
```

Start the server:

```bash
npm run dev
```

The server will run at:

```text
http://localhost:3000
```

For production-style start:

```bash
npm start
```

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port used by the server |
| `DATABASE_URL` | PostgreSQL database used by the application |
| `TEST_DATABASE_URL` | Separate PostgreSQL database used for tests |
| `JWT_SECRET` | Secret used to sign JWT tokens |
| `JWT_EXPIRES_IN` | JWT token expiry time |
| `WEBHOOK_SECRET` | Secret used to verify payment webhooks |

Example:

```text
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/diagnostic_booking
TEST_DATABASE_URL=postgresql://postgres:password@localhost:5432/diagnostic_booking_test
JWT_SECRET=your-secret
JWT_EXPIRES_IN=1d
WEBHOOK_SECRET=your-webhook-secret
```

## Running Tests

Run the automated tests using:

```bash
npm test
```

The tests use a separate PostgreSQL database so that the main application database is not affected.

The tests cover:

- Signup
- Login
- Authentication
- Unauthorized requests
- Diagnostic centres
- Diagnostic tests
- Bookings
- Booking ownership
- Booking cancellation
- Successful payments
- Failed payments
- Payment webhooks
- Duplicate webhook events
- Multiple identical webhook events

## API Endpoints

| Method | Endpoint | Authentication | Description |
|---|---|---|---|
| POST | `/auth/signup` | No | Create a new user |
| POST | `/auth/login` | No | Login and get JWT |
| GET | `/centres` | No | Get all diagnostic centres |
| POST | `/centres` | Yes | Create a diagnostic centre |
| GET | `/centres/:id` | No | Get a centre by ID |
| GET | `/tests` | No | Get diagnostic tests |
| POST | `/tests` | Yes | Add a diagnostic test |
| GET | `/tests/:id` | No | Get a test by ID |
| POST | `/bookings` | Yes | Create a booking |
| GET | `/bookings` | Yes | Get the user's bookings |
| GET | `/bookings/:id` | Yes | Get a booking by ID |
| PATCH | `/bookings/:id/cancel` | Yes | Cancel a booking |
| POST | `/payments` | Yes | Make a simulated payment |
| POST | `/payments/webhook` | Webhook secret | Process a payment webhook |

Protected endpoints require:

```text
Authorization: Bearer <token>
```

## Example API Requests

### 1. Signup

```http
POST /auth/signup
Content-Type: application/json
```

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "secret123"
}
```

The response contains a JWT token.

### 2. Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "alice@example.com",
  "password": "secret123"
}
```

Use the returned token for protected requests.

### 3. Create Booking

```http
POST /bookings
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "centre_id": 1,
  "test_id": 1,
  "appointment_at": "2030-01-15T10:30:00Z"
}
```

The booking amount is taken from the price of the selected diagnostic test.

### 4. Make a Payment

```http
POST /payments
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "booking_id": 1,
  "result": "SUCCESS"
}
```

`result` can be:

```text
SUCCESS
FAILED
```

A successful payment changes the booking status to `CONFIRMED`.

## Booking Status

The booking can have the following statuses:

```text
PENDING
CONFIRMED
FAILED
CANCELLED
```

Basic flow:

```text
PENDING -> CONFIRMED
PENDING -> FAILED
FAILED  -> CONFIRMED
FAILED  -> FAILED

PENDING / FAILED / CONFIRMED -> CANCELLED
```

A user can only view, pay for, or cancel their own bookings.

## Payment Webhook

The webhook endpoint is:

```text
POST /payments/webhook
```

It requires the following header:

```text
x-webhook-secret: <WEBHOOK_SECRET>
```

Example request:

```json
{
  "event_id": "evt_001",
  "booking_id": 1,
  "status": "SUCCESS",
  "amount": 350
}
```

Each webhook contains a unique `event_id`.

The `event_id` is stored in the database with a unique constraint. If the same webhook is received again, it is treated as a duplicate and no second payment is created.

Payment creation and booking update are handled in the same database transaction.

If something goes wrong while processing the webhook, the transaction is rolled back.

## Database

The project uses PostgreSQL with six tables:

```text
users
centres
diagnostic_tests
bookings
payments
webhook_events
```

The tables use primary keys, foreign keys and basic constraints.

Direct SQL queries are used through the `pg` library.

## Manual API Testing

A Postman collection is included in:

```text
postman_collection.json
```

It can be imported into:

- Postman
- Thunder Client

The APIs can be tested in the following order:

```text
Signup
Login
Get Centres
Get Tests
Create Booking
Make Payment
Test Webhook
```

With Thunder Client, the JWT token needs to be copied manually into the Authorization header after login.

## Error Handling

The API returns appropriate HTTP status codes for common cases:

```text
400 - Invalid request
401 - Missing or invalid authentication
403 - User does not have access
404 - Resource not found
409 - Action is not allowed in the current state
```

Errors are returned in this format:

```json
{
  "error": "Error message"
}
```

## Notes

- Payments are simulated. No real payment gateway is used.
- Any authenticated user can create diagnostic centres and tests.
- There are no admin roles in this version.
- Cancelling a paid booking does not process a refund.
- Webhooks use a shared secret instead of a signed payload.
- The project is intentionally kept simple and uses direct SQL instead of an ORM.

## Future Improvements

If I had more time, I would add more automated test cases, API documentation, pagination for list endpoints, and more detailed logging.