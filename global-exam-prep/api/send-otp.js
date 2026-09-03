import nodemailer from 'nodemailer';

// ─── Guards ──────────────────────────────────────────────────────────────────

/** Minimal HTML escaping; the template interpolates this into the body. */
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const WINDOW_MS     = 10 * 60 * 1000;
const MAX_PER_EMAIL = 5;   // codes per address per window
const MAX_PER_IP     = 12;  // requests per IP per window
const emailHits = new Map();
const ipHits    = new Map();

function slide(map, key, max) {
    const now = Date.now();
    const kept = (map.get(key) || []).filter(t => now - t < WINDOW_MS);
    if (kept.length >= max) {
        const retryIn = Math.ceil((WINDOW_MS - (now - kept[0])) / 1000);
        map.set(key, kept);
        return retryIn;
    }
    kept.push(now);
    map.set(key, kept);
    return 0;
}

function checkRateLimit(email, ip) {
    // Evict occasionally so long-lived instances do not grow without bound.
    if (emailHits.size > 5000 || ipHits.size > 5000) {
        emailHits.clear();
        ipHits.clear();
    }
    return Math.max(slide(emailHits, email, MAX_PER_EMAIL), slide(ipHits, ip, MAX_PER_IP));
}

export default async function handler(req, res) {
    // ─── CORS preflight ───────────────────────────────────────────────────────
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ─── Parse body ───────────────────────────────────────────────────────────
    const { email, otp, userName } = req.body || {};

    if (!email || !otp) {
        return res.status(400).json({ error: 'Missing email or OTP' });
    }

    // ─── Validation ───────────────────────────────────────────────────────────
    // This endpoint is unauthenticated, so it must not be usable as a generic
    // mail relay or as an HTML-injection sink into our own email template.
    const cleanEmail = String(email).trim().toLowerCase();

    if (!/^[^@\s]{1,64}@[^@\s.]{1,253}$/.test(cleanEmail) || !cleanEmail.includes('.', cleanEmail.indexOf('@'))) {
        return res.status(400).json({ error: 'Invalid email address.' });
    }

    // The OTP is rendered at 56px in a monospace block — it must be exactly
    // 6 digits and nothing else, or it becomes arbitrary markup in the body.
    if (!/^\d{6}$/.test(String(otp))) {
        return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Stripped of tags/quotes and length-capped before it reaches the template.
    const safeName = escapeHtml(
        String(userName || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    ) || 'there';

    // ─── Rate limit (per instance) ────────────────────────────────────────────
    // Vercel edge instances are short-lived, so this is a blunt but real
    // deterrent against hammering one address or spraying many. The client also
    // enforces a 60s resend cooldown.
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const limited = checkRateLimit(cleanEmail, ip);
    if (limited) {
        return res.status(429).json({
            error: `Too many codes requested. Try again in ${limited}s.`,
        });
    }

    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPass) {
        return res.status(500).json({ error: 'Email service not configured (GMAIL_USER or GMAIL_APP_PASSWORD missing).' });
    }

    // ─── Email HTML ───────────────────────────────────────────────────────────
    const firstName = safeName.split(' ')[0];

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verify your PrepMaster account</title>
</head>
<body style="margin:0;padding:0;background:#090910;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background:linear-gradient(160deg,#090910 0%,#0f1020 100%);min-height:100vh;padding:48px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:520px;" cellpadding="0" cellspacing="0" border="0">

        <!-- ▸ Header gradient bar -->
        <tr>
          <td style="background:linear-gradient(135deg,#1d4ed8 0%,#7c3aed 60%,#db2777 100%);
                     border-radius:18px 18px 0 0;padding:36px 44px;text-align:center;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr><td align="center">
                <div style="display:inline-block;background:rgba(255,255,255,0.18);
                            border-radius:14px;padding:12px 20px;margin-bottom:16px;
                            border:1px solid rgba(255,255,255,0.25);">
                  <span style="font-size:24px;letter-spacing:1px;">📚</span>
                </div><br>
                <span style="color:#fff;font-size:28px;font-weight:800;letter-spacing:-0.6px;">
                  PrepMaster
                </span><br>
                <span style="color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:0.4px;margin-top:4px;display:block;">
                  AI-Powered Exam Preparation
                </span>
              </td></tr>
            </table>
          </td>
        </tr>

        <!-- ▸ Body -->
        <tr>
          <td style="background:#0f1117;border-left:1px solid rgba(255,255,255,0.07);
                     border-right:1px solid rgba(255,255,255,0.07);padding:44px 44px 36px;">
            <h2 style="margin:0 0 10px;color:#f9fafb;font-size:24px;font-weight:700;
                       letter-spacing:-0.3px;">Verify your email</h2>
            <p style="margin:0 0 32px;color:#9ca3af;font-size:15px;line-height:1.7;">
              Hey <strong style="color:#e5e7eb;">${firstName}</strong>! Enter the code below
              to complete your PrepMaster registration. It expires in
              <strong style="color:#a78bfa;">10 minutes</strong>.
            </p>

            <!-- OTP Box -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.12));
                           border:1px solid rgba(139,92,246,0.3);border-radius:16px;
                           padding:32px 24px;text-align:center;">
                  <p style="margin:0 0 12px;color:#9ca3af;font-size:11px;text-transform:uppercase;
                             letter-spacing:3.5px;font-weight:700;">Your Verification Code</p>
                  <p style="margin:0;font-size:56px;font-weight:900;letter-spacing:16px;
                             color:#ffffff;font-family:'Courier New',Courier,monospace;
                             text-shadow:0 0 40px rgba(139,92,246,0.5);">${otp}</p>
                </td>
              </tr>
            </table>

            <!-- Security notice -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.18);
                           border-radius:12px;padding:16px 20px;">
                  <p style="margin:0;color:#fbbf24;font-size:12.5px;line-height:1.65;">
                    <strong>⚠&nbsp; Security tip:</strong> PrepMaster will never ask for this code via phone,
                    chat, or email reply. If you didn't sign up, you can safely ignore this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ▸ Footer -->
        <tr>
          <td style="background:#0a0b10;border:1px solid rgba(255,255,255,0.06);border-top:none;
                     border-radius:0 0 18px 18px;padding:22px 44px;text-align:center;">
            <p style="margin:0;color:#374151;font-size:12px;line-height:1.7;">
              © 2025 PrepMaster &nbsp;·&nbsp; Built for students, by students<br>
              <span style="color:#1f2937;">
                You received this email because you requested to create a PrepMaster account.
              </span>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    // ─── Send via Nodemailer ──────────────────────────────────────────────────
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: gmailUser,
                pass: gmailPass
            }
        });

        const mailOptions = {
            from: `"PrepMaster" <${gmailUser}>`,
            to: cleanEmail,
            subject: `${otp} — your PrepMaster verification code`,
            html: html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('[send-otp] Email sent: ', info.messageId);

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[send-otp] Nodemailer error:', err.message);
        return res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }
}
