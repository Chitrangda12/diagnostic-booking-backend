// Custom error for API responses.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Handles errors from async route functions.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

function parseId(value) {
  const text = String(value);

  if (!/^[1-9]\d{0,9}$/.test(text)) {
    return null;
  }

  const n = Number(text);
  return n <= 2147483647 ? n : null;
}

function isNonEmptyString(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

module.exports = {
  HttpError,
  asyncHandler,
  parseId,
  isNonEmptyString,
};