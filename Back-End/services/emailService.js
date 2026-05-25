const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTPEmail(email, otp, userName) {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Mawby Teams Login Code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Inter',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#fb6a2c 0%,#e8521a 100%);padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Mawby Teams</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;">Enterprise Communication Platform</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:48px 40px;text-align:center;">
              <div style="width:72px;height:72px;background:#fff5f0;border-radius:50%;margin:0 auto 24px;line-height:72px;font-size:32px;">&#x1F4E7;</div>
              <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#1a2033;">Verify Your Login</h2>
              <p style="margin:0 0 36px;font-size:15px;color:#6b7280;line-height:1.6;">
                Hello <strong style="color:#1a2033;">${userName}</strong>, use the code below to complete your sign-in to <strong style="color:#1a2033;">Mawby Teams</strong>.
              </p>

              <!-- OTP Code Box -->
              <div style="background:#f8f9ff;border:2px solid #e8eaf6;border-radius:16px;padding:32px 40px;margin:0 0 32px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#9ca3af;">Your verification code</p>
                <div style="font-size:52px;font-weight:800;letter-spacing:18px;color:#fb6a2c;font-family:'Courier New',Courier,monospace;padding-left:18px;">${otp}</div>
                <p style="margin:14px 0 0;font-size:13px;color:#9ca3af;">This code expires in <strong>10 minutes</strong></p>
              </div>

              <!-- Security Notices -->
              <div style="text-align:left;background:#fafafa;border:1px solid #f0f0f0;border-radius:12px;padding:20px 24px;">
                <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.5;">
                  <strong>&#9888;&#65039; Do not share this code with anyone.</strong><br />
                  Mawby Teams staff will never ask for your verification code.
                </p>
                <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
                  If you did not request this code, please contact your administrator immediately.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9ff;padding:24px 40px;text-align:center;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">&#169; ${new Date().getFullYear()} Mawby Technologies &middot; All rights reserved</p>
              <p style="margin:6px 0 0;font-size:11px;color:#d1d5db;">This is an automated security email. Please do not reply.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  await resend.emails.send({
    from: 'Mawby Teams <onboarding@resend.dev>',
    to: email,
    subject: 'Your Mawby Teams Login Code',
    html,
  });
}

module.exports = { sendOTPEmail };
