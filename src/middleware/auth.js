const jwt = require('jsonwebtoken');
const { HttpError } = require('../utils');

// Protects a route. Expects:  Authorization: Bearer <token>
// On success, sets req.user = { id, email }.
module.exports = function auth(req, res, next) {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Missing or malformed Authorization header'));
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    next(new HttpError(401, 'Invalid or expired token'));
  }
};
