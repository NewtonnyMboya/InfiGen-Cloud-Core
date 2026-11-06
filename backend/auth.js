const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const pool = require("./db");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." }
});

function createToken(user) {
  return jwt.sign(
    { role: user.role },
    process.env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: "1h",
      issuer: "infigen-api",
      audience: "infigen-app"
    }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "infigen-api",
      audience: "infigen-app"
    });
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired access token." });
  }
}

router.post("/register", async (req, res) => {
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = req.body.phone
    ? String(req.body.phone).trim()
    : null;
  const password = String(req.body.password || "");

  if (fullName.length < 2 || fullName.length > 150) {
    return res.status(400).json({ error: "Enter a valid full name." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return res.status(400).json({ error: "Enter a valid email address." });
  }

  if (password.length < 10 || password.length > 72 ||
      !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return res.status(400).json({
      error: "Password must be 10–72 characters and contain letters and numbers."
    });
  }

  if (phone && phone.length > 30) {
    return res.status(400).json({ error: "Invalid phone number." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const passwordHash = await bcrypt.hash(password, 12);

    const inserted = await client.query(
      `INSERT INTO app_users (full_name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, 'customer')
       RETURNING id, full_name, email, phone, role, is_verified, created_at`,
      [fullName, email, phone, passwordHash]
    );

    const user = inserted.rows[0];
    const accountNumber = "IG" + crypto.randomBytes(8).toString("hex").toUpperCase();

    await client.query(
      `INSERT INTO customer_accounts (user_id, account_number, currency, status)
       VALUES ($1, $2, 'KES', 'pending')`,
      [user.id, accountNumber]
    );

    await client.query(
      `INSERT INTO audit_events (actor_user_id, event_type, details)
       VALUES ($1, 'customer_registered', $2::jsonb)`,
      [user.id, JSON.stringify({ email: user.email })]
    );

    await client.query("COMMIT");

    res.status(201).json({
      message: "Registration successful. Email verification is not yet enabled.",
      user,
      account: {
        account_number: accountNumber,
        currency: "KES",
        status: "pending"
      },
      access_token: createToken(user),
      token_type: "Bearer",
      expires_in: 3600
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    console.error("Registration failed:", error.code || "database error");
    return res.status(500).json({ error: "Registration could not be completed." });
  } finally {
    client.release();
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!email || !password || email.length > 255 || password.length > 72) {
    return res.status(400).json({ error: "Enter your email and password." });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, password_hash, role, is_verified, is_active
       FROM app_users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [email]
    );

    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "This account is inactive." });
    }

    await pool.query(
      `INSERT INTO audit_events (actor_user_id, event_type, details)
       VALUES ($1, 'customer_login', $2::jsonb)`,
      [user.id, JSON.stringify({ email: user.email })]
    );

    const publicUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      is_verified: user.is_verified
    };

    res.json({
      message: "Login successful.",
      user: publicUser,
      access_token: createToken(user),
      token_type: "Bearer",
      expires_in: 3600
    });
  } catch (error) {
    console.error("Login failed:", error.code || "database error");
    res.status(500).json({ error: "Login could not be completed." });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, role, is_verified, is_active, created_at
       FROM app_users
       WHERE id = $1`,
      [req.auth.sub]
    );

    if (!result.rows[0] || !result.rows[0].is_active) {
      return res.status(401).json({ error: "Account unavailable." });
    }

    const accounts = await pool.query(
      `SELECT account_number, currency, status, created_at
       FROM customer_accounts
       WHERE user_id = $1`,
      [req.auth.sub]
    );

    res.json({
      user: result.rows[0],
      accounts: accounts.rows
    });
  } catch (error) {
    console.error("Account lookup failed:", error.code || "database error");
    res.status(500).json({ error: "Account lookup failed." });
  }
});

module.exports = { router, authenticate };
