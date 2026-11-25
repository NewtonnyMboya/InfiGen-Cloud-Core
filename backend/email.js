const express = require("express");
const rateLimit = require("express-rate-limit");
const { Resend } = require("resend");

const router = express.Router();

const testEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 2,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Email test limit reached. Try again in an hour." }
});

router.post("/test", testEmailLimiter, async (req, res) => {
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.RESEND_TEST_RECIPIENT;

  if (!apiKey || !recipient) {
    return res.status(503).json({
      error: "Email testing is not configured."
    });
  }

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "InfiGen <onboarding@resend.dev>",
      to: [recipient],
      subject: "InfiGen email delivery test",
      text: "Your InfiGen application has successfully connected to Resend. Transactional email delivery is responding.",
      html: "<h1>InfiGen email test</h1><p>Your InfiGen application has successfully connected to Resend.</p><p>Transactional email delivery is responding.</p>"
    });

    if (error) {
      console.error("Resend test email rejected:", error.name || "ResendError");
      return res.status(502).json({
        error: "Resend could not accept the test email. Check the Resend domain and API-key permissions."
      });
    }

    return res.json({
      status: "accepted",
      provider: "resend",
      recipient,
      email_id: data.id
    });
  } catch (error) {
    console.error("Resend test email request failed:", error.name || "NetworkError");
    return res.status(502).json({
      error: "Email provider request failed."
    });
  }
});

module.exports = router;
