const express = require('express');
const { HttpError } = require('./utils');

const app = express();

app.use(express.json());

// Make sure req.body is always available.
app.use((req, res, next) => {
  if (!req.body) req.body = {};
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', require('./routes/auth'));
app.use('/centres', require('./routes/centres'));
app.use('/tests', require('./routes/tests'));
app.use('/bookings', require('./routes/bookings'));
app.use('/payments', require('./routes/payments'));

// Unknown route
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Handle errors from the routes.
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;