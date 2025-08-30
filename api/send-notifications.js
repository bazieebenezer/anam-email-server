const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');

// Initialize Firebase Admin SDK
// We will use environment variables for the service account key
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  if (admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
}

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Main handler for the Vercel serverless function
module.exports = async (req, res) => {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow any origin
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { type, description } = req.body;

    // Basic validation
    if (!type || !description) {
      return res.status(400).json({ error: 'Missing type or description in request body' });
    }

    // 1. Get all user emails from Firebase Authentication
    const listUsersResult = await admin.auth().listUsers();
    const emails = listUsersResult.users.map(userRecord => userRecord.email).filter(email => !!email);

    if (emails.length === 0) {
      return res.status(200).json({ message: 'No users to notify.' });
    }

    // 2. Format the email content
    const subject = `Nouveau ${type} publié par METEO Burkina`;
    const descriptionSnippet = description.split('\n').slice(0, 3).join('\n') + '...';
    const htmlBody = `
      <p>Un nouveau <strong>${type}</strong> a été publié.</p>
      <p><strong>Description :</strong></p>
      <pre>${descriptionSnippet}</pre>
      <p>Pour plus d'informations, veuillez visiter le site officiel :</p>
      <a href="https://meteoburkina.bf/">METEO Burkina</a>
    `;

    // 3. Send the email using Resend
    await resend.emails.send({
      from: 'METEO Burkina <onboarding@resend.dev>', // Using the default Resend address
      to: 'onboarding@resend.dev', // For testing, send to a known address first
      bcc: emails, // Send to all users in blind carbon copy
      subject: subject,
      html: htmlBody,
    });

    res.status(200).json({ message: 'Notifications sent successfully!' });

  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send notifications.', details: error.message });
  }
};
