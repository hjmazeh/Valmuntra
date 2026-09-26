const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();

// EmailJS is connected to the real support@valmuntra.com Outlook mailbox and
// reliably reaches real inboxes -- unlike Firebase Auth's own built-in email
// relay, which Google blocks outright for this domain regardless of correct
// SPF/DKIM (confirmed via a live bounce from mailer-daemon@googlemail.com).
// This function generates the verification link server-side (requires the
// Admin SDK) and sends it through EmailJS instead of Firebase's relay.
const EMAILJS_SERVICE_ID = 'service_0oshg5a';
const EMAILJS_VERIFY_TEMPLATE_ID = 'template_elv2xto';
const EMAILJS_PUBLIC_KEY = 'iLZjn9PNYzglkaYKn';

const emailjsPrivateKey = defineSecret('EMAILJS_PRIVATE_KEY');

exports.sendVerificationEmail = onCall({ secrets: [emailjsPrivateKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const uid = request.auth.uid;
  const userRecord = await admin.auth().getUser(uid);

  if (!userRecord.email) {
    throw new HttpsError('failed-precondition', 'Account has no email address.');
  }
  if (userRecord.emailVerified) {
    return { alreadyVerified: true };
  }

  const link = await admin.auth().generateEmailVerificationLink(userRecord.email, {
    url: 'https://valmuntra.com/login.html',
    handleCodeInApp: false
  });

  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_VERIFY_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: emailjsPrivateKey.value(),
      template_params: {
        to_email: userRecord.email,
        verify_link: link
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new HttpsError('internal', `EmailJS send failed: ${res.status} ${text}`);
  }

  return { sent: true };
});
