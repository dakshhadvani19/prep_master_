import nodemailer from 'nodemailer';

const TO_EMAIL = 'dakshpatel09765gy@gmail.com';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const GMAIL_USER = process.env.GMAIL_USER;
    const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
        return res.status(500).json({ 
            error: 'Email service not configured. GMAIL_USER and GMAIL_APP_PASSWORD environmental variables are missing.' 
        });
    }

    try {
        const body = req.body;
        const { type = 'general', rating = 0, subject, message, name, email } = body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        const ratingStars = rating > 0 ? '⭐'.repeat(rating) + ` (${rating}/5)` : 'Not rated';
        const typeLabel = {
            general: '💬 General Feedback',
            bug: '🐛 Bug Report',
            feature: '✨ Feature Request',
            content: '📚 Content Issue',
            ai: '🤖 AI Quality',
        }[type] || type;

        const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f1115; color: #e2e8f0; margin: 0; padding: 0; }
  .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 24px; }
  .card { background: #1a1d23; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; overflow: hidden; }
  .header { background: linear-gradient(135deg,#8b5cf6,#3b82f6); padding: 28px 32px; }
  .header h1 { margin: 0; color: white; font-size: 22px; font-weight: 800; }
  .header p { margin: 6px 0 0; color: rgba(255,255,255,0.75); font-size: 14px; }
  .body { padding: 28px 32px; }
  .meta-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; }
  .badge { background: rgba(139,92,246,0.15); border: 1px solid rgba(139,92,246,0.3); color: #c4b5fd; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; }
  .badge.rating { background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.3); color: #fbbf24; }
  .field-label { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
  .field-value { background: #252832; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; color: #e2e8f0; font-size: 15px; line-height: 1.7; margin-bottom: 20px; white-space: pre-wrap; }
  .footer { padding: 16px 32px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #475569; text-align: center; }
</style></head>
<body>
<div class="wrapper">
  <div class="card">
    <div class="header">
      <h1>📨 New PrepMaster Feedback</h1>
      <p>Received via the in-app feedback form — High Priority</p>
    </div>
    <div class="body">
      <div class="meta-row">
        <span class="badge">${typeLabel}</span>
        <span class="badge rating">${ratingStars}</span>
      </div>

      ${name ? `<div class="field-label">From</div><div class="field-value">${name}${email ? ` &lt;${email}&gt;` : ''}</div>` : ''}
      ${subject ? `<div class="field-label">Subject</div><div class="field-value">${subject}</div>` : ''}

      <div class="field-label">Message</div>
      <div class="field-value">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
    <div class="footer">PrepMaster · Feedback System · ${new Date().toUTCString()}</div>
  </div>
</div>
</body>
</html>`;

        const emailSubject = `[PrepMaster Feedback] ${typeLabel}${subject ? ' — ' + subject : ''}`;

        // Create Nodemailer transporter
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_APP_PASSWORD,
            },
        });

        // Send email
        await transporter.sendMail({
            from: `"PrepMaster Feedback" <${GMAIL_USER}>`,
            to: TO_EMAIL,
            replyTo: email ? email : GMAIL_USER,
            subject: emailSubject,
            html: htmlBody,
            priority: 'high',
        });

        return res.status(200).json({ success: true });

    } catch (err) {
        console.error('Email error:', err);
        return res.status(500).json({ error: err.message || 'Internal server error' });
    }
}

