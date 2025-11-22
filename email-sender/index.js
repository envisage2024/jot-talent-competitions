require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');

const app = express();
app.use(bodyParser.json());

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Missing FIREBASE_SERVICE_ACCOUNT in env (base64 JSON).');
  process.exit(1);
}

const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

if (!process.env.SENDGRID_API_KEY || !process.env.FROM_EMAIL) {
  console.error('Missing SENDGRID_API_KEY or FROM_EMAIL in env.');
  process.exit(1);
}

// Optional: friendly sender name and reply-to address
const FROM_NAME = process.env.FROM_NAME || 'Jot Talent Competitions';
const REPLY_TO = process.env.REPLY_TO || process.env.FROM_EMAIL;

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// POST /sendVerification
// body: { email }
app.post('/sendVerification', async (req, res) => {
  const { email, token } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });

  try {
    let link;
    if (token) {
      // If a token is provided, build a site verification link rather than Firebase action link
      const base = process.env.SITE_BASE_URL || (process.env.AFTER_VERIFY_URL || 'http://localhost:3000');
      // Ensure no trailing slash
      const normalizedBase = base.replace(/\/$/, '');
      link = `${normalizedBase}/verify.html?token=${encodeURIComponent(token)}`;
    } else {
      // Fallback to Firebase generated verification link
      const actionCodeSettings = {
        url: process.env.AFTER_VERIFY_URL || 'https://example.com/login',
        handleCodeInApp: false
      };
      link = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
    }

    const msg = {
      to: email,
      from: { email: process.env.FROM_EMAIL, name: FROM_NAME },
      replyTo: REPLY_TO,
      subject: 'Confirm your Jot Talent Competitions account',
      text: `Hello,\n\nThanks for creating an account with Jot Talent Competitions. Please confirm your email by visiting the link: ${link}\n\nIf you didn't create an account, ignore this message.`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#222;line-height:1.4;">
          <p style="margin:0 0 8px 0">Hello,</p>
          <p style="margin:0 0 8px 0">Thanks for creating an account with <strong>Jot Talent Competitions</strong>. Click the button below to verify your email address.</p>
          <p style="text-align:center;margin:24px 0;"><a href="${link}" style="background:#1976d2;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Verify Email</a></p>
          <p style="margin:0 0 8px 0">If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="word-break:break-all;"><a href="${link}">${link}</a></p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
          <p style="margin:0;font-size:12px;color:#666;">If you didn't create an account, ignore this email or contact <a href="mailto:${REPLY_TO}">${REPLY_TO}</a>.</p>
        </div>
      `,
      // Add headers that can help deliverability (List-Unsubscribe helps some providers)
      headers: {
        'X-Sender': FROM_NAME,
        'List-Unsubscribe': `<mailto:${REPLY_TO}>`
      }
    };

    await sgMail.send(msg);
    return res.json({ success: true, link });
  } catch (err) {
    console.error('sendVerification error', err);
    return res.status(500).json({ error: err.message || 'send failed' });
  }
});

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Email sender running on port ${port}`));
