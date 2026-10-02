const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { HttpError, asyncHandler, isNonEmptyString } = require('../utils');

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    }
  );
}

// POST /auth/signup
router.post(
  '/signup',
  asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!isNonEmptyString(name, 100)) {
      throw new HttpError(400, 'name is required (max 100 characters)');
    }

    if (!isNonEmptyString(email, 255) || !EMAIL_REGEX.test(email.trim())) {
      throw new HttpError(400, 'A valid email is required');
    }

    if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
      throw new HttpError(400, 'password must be 6 to 72 characters');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    let user;

    try {
      const { rows } = await db.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
        [name.trim(), email.trim().toLowerCase(), passwordHash]
      );

      user = rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw new HttpError(409, 'Email is already registered');
      }

      throw err;
    }

    res.status(201).json({
      user,
      token: signToken(user),
    });
  })
);

// POST /auth/login
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !email ||
      !password
    ) {
      throw new HttpError(400, 'email and password are required');
    }

    const { rows } = await db.query(
      'SELECT id, name, email, password_hash, created_at FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Invalid email or password');
    }

    delete user.password_hash;

    res.json({
      user,
      token: signToken(user),
    });
  })
);

module.exports = router;