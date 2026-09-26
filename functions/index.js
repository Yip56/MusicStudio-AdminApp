const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

// Public HTTPS endpoint — returns the full fee schedule for all instruments.
// Response shape: { classical: { Piano: { Beginner: { "30": N, "45": N, "60": N }, ... }, ... }, contemporary: { ... } }
// Cache-Control: 10 minutes so the website isn't hitting Firestore on every page load.
// No auth required. Access to Firestore is server-side via admin SDK — client rules are not used.
exports.getPublicFees = onRequest(
  {
    region: "asia-southeast1",
    cors: true,
    invoker: "public",
    timeoutSeconds: 10,
    minInstances: 0,
  },
  async (_req, res) => {
    res.set("Cache-Control", "public, max-age=600");

    const db = getFirestore();
    const [classicalSnap, contemporarySnap] = await Promise.all([
      db.doc("fees/classical").get(),
      db.doc("fees/contemporary").get(),
    ]);

    res.json({
      classical:    classicalSnap.exists    ? classicalSnap.data()    : {},
      contemporary: contemporarySnap.exists ? contemporarySnap.data() : {},
    });
  }
);
