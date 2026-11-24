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

// Public HTTPS endpoint — returns the products marked "On website" in StudioOS.
// Response shape: { products: [{ id, name, description, category, price|null, status, images: [url, …] }] }
// Only these fields are exposed; unpublished products and internal fields never leave the server.
exports.getPublicProducts = onRequest(
  {
    region: "asia-southeast1",
    cors: true,
    invoker: "public",
    timeoutSeconds: 10,
    minInstances: 0,
  },
  async (_req, res) => {
    res.set("Cache-Control", "public, max-age=300");

    const snap = await getFirestore().collection("products").where("published", "==", true).get();
    const products = snap.docs
      .map(d => {
        const p = d.data();
        return {
          id: d.id,
          name: p.name ?? "",
          description: p.description ?? "",
          category: p.category ?? "",
          price: typeof p.price === "number" ? p.price : null,
          status: p.status === "sold_out" ? "sold_out" : "in_stock",
          images: (p.images ?? []).map(i => i.url).filter(Boolean),
          createdMs: p.createdAt?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => b.createdMs - a.createdMs)
      .map(({ createdMs, ...rest }) => rest);

    res.json({ products });
  }
);
