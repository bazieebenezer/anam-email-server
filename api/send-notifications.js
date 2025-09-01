const admin = require("firebase-admin");
const { Resend } = require("resend");

let firebaseInitialized = false;

// --- Defensive Firebase Initialization ---
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      firebaseInitialized = true;
      console.log("Firebase Admin SDK initialized successfully.");
    }
  } else {
    console.error(
      "FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set."
    );
  }
} catch (e) {
  console.error(
    "CRITICAL: Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY. The JSON is corrupt.",
    e.message
  );
  const keyStart = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.substring(0, 20);
  console.error(`The key starts with: "${keyStart}..."
`);
}
// --- End of Initialization ---

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!firebaseInitialized) {
    console.error("Handler invoked but Firebase not initialized.");
    return res.status(500).json({
      error: "Server configuration error: Firebase Admin SDK not initialized.",
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { type, description, recipientId } = req.body;
    console.log("Received request with body:", req.body);

    if (!type || !description) {
      return res.status(400).json({ error: "Missing type or description" });
    }

    let emails = [];

    if (recipientId && recipientId !== "all") {
      console.log(`Specific recipient detected. UID: ${recipientId}`);
      try {
        const userRecord = await admin.auth().getUser(recipientId);
        console.log("Successfully fetched userRecord:", userRecord.toJSON());
        if (userRecord.email) {
          emails.push(userRecord.email);
        } else {
          console.warn(`User with UID ${recipientId} does not have an email.`);
        }
      } catch (userError) {
        console.error(
          `Failed to fetch user with UID: ${recipientId}`,
          userError
        );
      }
    } else {
      console.log("Recipient is 'all' or undefined. Fetching all users.");
      const listUsersResult = await admin.auth().listUsers();
      emails = listUsersResult.users
        .map((userRecord) => userRecord.email)
        .filter((email) => !!email);
    }

    console.log("Final list of emails to be sent:", emails);

    if (emails.length === 0) {
      console.log("No users to notify. Exiting.");
      return res.status(200).json({ message: "No users to notify." });
    }

    const subject = `Nouveau ${type} publié par METEO Burkina`;
    const descriptionSnippet =
      description.split("\n").slice(0, 3).join("\n") + "...";
    const htmlBody = `<div style="font-family: Inter, sans-serif; font-size: 16px; color: #333; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
    <div style="text-align: center; margin-bottom: 20px;">
        <h1 style="color: #0077cc; font-size: 24px; margin: 0; font-weight: 700;">Alerte METEO Burkina</h1>
    </div>
    <div style="background-color: #f9f9f9; padding: 20px; border-radius: 6px; border-left: 5px solid #ffcc00;">
        <p style="margin: 0; font-size: 18px; color: #666666;">Un nouveau <strong style="color: #0077cc;">${type}</strong> a été publié.</p>
    </div>
    <div style="margin-top: 20px;">
        <h2 style="color: #555; font-size: 20px; border-bottom: 2px solid #eee; padding-bottom: 10px;">Description :</h2>
        <pre style="background-color: #eee; padding: 15px; border-radius: 4px; white-space: pre-wrap; word-wrap: break-word; font-family: Inter, sans-serif;">${descriptionSnippet}</pre>
    </div>
    <div style="text-align: center; margin-top: 30px;">
        <a href="https://meteoburkina.bf/" style="background-color: #0077cc; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            Visitez le site officiel
        </a>
    </div>
    <div style="text-align: center; margin-top: 20px; font-size: 12px; color: #888;">
        <p>Ce service est fourni par METEO Burkina.</p>
    </div>
</div>`;

    console.log(`Sending emails to ${emails.length} recipients in a loop...`);

    const sendPromises = emails.map((email) =>
      resend.emails.send({
        from: "METEO Burkina <onboarding@resend.dev>",
        to: [email], // Send to a single email address
        subject: subject,
        html: htmlBody,
      })
    );

    await Promise.all(sendPromises);

    console.log("All emails processed successfully.");

    res.status(200).json({ message: "Notifications sent successfully!" });
  } catch (error) {
    console.error("Error during execution:", error);
    res
      .status(500)
      .json({ error: "Failed to send notifications.", details: error.message });
  }
};
