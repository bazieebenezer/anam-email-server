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
  // Log the first 20 characters to help debug the malformed JSON without leaking sensitive info
  const keyStart = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.substring(0, 20);
  console.error(`The key starts with: "${keyStart}..."
`);
}
// --- End of Initialization ---

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  console.log(
    `[${new Date().toISOString()}] Function invoked with method: ${req.method}`
  );

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Check if Firebase failed to initialize
  if (!firebaseInitialized) {
    return res
      .status(500)
      .json({
        error:
          "Server configuration error: Firebase Admin SDK not initialized.",
      });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { type, description } = req.body;

    if (!type || !description) {
      return res.status(400).json({ error: "Missing type or description" });
    }

    const listUsersResult = await admin.auth().listUsers();
    const emails = listUsersResult.users
      .map((userRecord) => userRecord.email)
      .filter((email) => !!email);

    if (emails.length === 0) {
      return res.status(200).json({ message: "No users to notify." });
    }

    const subject = `Nouveau ${type} publié par METEO Burkina`;
    const descriptionSnippet =
      description.split("\n").slice(0, 3).join("\n") + "...";
    const htmlBody = `<p>Un nouveau <strong>${type}</strong> a été publié.</p><p><strong>Description :</strong></p><pre>${descriptionSnippet}</pre><p>Pour plus d'informations, veuillez visiter le site officiel :</p><a href="https://meteoburkina.bf/">METEO Burkina</a>`;

    await resend.emails.send({
      from: "METEO Burkina <onboarding@resend.dev>",
      to: emails, // Changed from test address to actual user emails
      subject: subject,
      html: htmlBody,
    });

    res.status(200).json({ message: "Notifications sent successfully!" });
  } catch (error) {
    console.error("Error during execution:", error);
    res
      .status(500)
      .json({ error: "Failed to send notifications.", details: error.message });
  }
};
