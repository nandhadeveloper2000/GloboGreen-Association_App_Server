// index.js (server entry)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const connectDB = require("./src/config/connectDB.js");
const UserModel = require("./src/models/user.model.js");

// Routes
const authRouter = require("./src/routes/auth.routes.js");
const userRouter = require("./src/routes/user.routes.js");
const associationRouter = require("./src/routes/association.routes.js");
const uploadRouter = require("./src/routes/upload.routes.js");
const employeeRoutes = require("./src/routes/employee.routes.js");
const qrRoutes = require("./src/routes/qr.routes.js");
const subscriptionRoutes = require("./src/routes/subscription.routes");
const locationRoutes = require("./src/routes/location.routes");
const kycRoutes = require("./src/routes/kyc.routes");
const adminRoutes = require("./src/routes/admin.routes");
const brandRoutes = require("./src/routes/brand.routes");
const seriesRoutes = require("./src/routes/series.routes");
const modelRoutes = require("./src/routes/model.routes");
const sparePartsRoutes = require("./src/routes/spareParts.routes");


const app = express();
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || "development";
const isDev = NODE_ENV !== "production";

/* -----------------------------
 * Security & Parsers (before routes)
 * ----------------------------- */
app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: isDev ? false : { policy: "same-origin" },
    crossOriginEmbedderPolicy: isDev ? false : true,
  })
);
app.use(helmet.referrerPolicy({ policy: "strict-origin-when-cross-origin" }));

app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(cookieParser());

/* -----------------------------
 * CORS (before routes)
 * - Dev: allow all
 * - Prod: allow only specific origins
 * ----------------------------- */
const allowedOrigins = [
  process.env.FRONTEND_URL, // ex: http://localhost:5173 or production domain
  "http://localhost:5173",
    "http://localhost:4173",
    "https://globo-green-association-admin-lchndq6wg.vercel.app"
].filter(Boolean);

app.use(
  cors({
    origin: isDev
      ? true
      : function (origin, cb) {
          // allow server-to-server / curl / postman (no origin)
          if (!origin) return cb(null, true);

          if (allowedOrigins.includes(origin)) return cb(null, true);

          return cb(new Error(`Not allowed by CORS: ${origin}`));
        },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    optionsSuccessStatus: 204,
  })
);

/* -----------------------------
 * Routes
 * ----------------------------- */
app.get("/", (_req, res) => res.json({ ok: true, name: "Association API" }));

app.get("/health", (_req, res) =>
  res.json({ ok: true, env: NODE_ENV, uptime: process.uptime() })
);

app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/associations", associationRouter);

// upload routes (keep if frontend depends on both)
app.use("/api/upload", uploadRouter);
app.use("/api/uploadImag", uploadRouter);

app.use("/api/employee", employeeRoutes);
app.use("/api/qr", qrRoutes);

// IMPORTANT: plural "subscriptions" must match your frontend constants
app.use("/api/subscriptions", subscriptionRoutes);

app.use("/api/locations", locationRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/brand", brandRoutes);
app.use("/api/series", seriesRoutes);
app.use("/api/model", modelRoutes);
app.use("/api/spareparts", sparePartsRoutes);
/* -----------------------------
 * 404 handler (after routes)
 * ----------------------------- */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
  });
});

/* -----------------------------
 * Error handler (last)
 * ----------------------------- */
app.use((err, _req, res, _next) => {
  console.error("🔥 Server Error:", err);

  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

/* -----------------------------
 * Admin seeding (2 logins)
 * ----------------------------- */
async function ensureDefaultAdmins() {
  const seeds = [
    {
      email: process.env.ADMIN_EMAIL_ID_1,
      password: process.env.ADMIN_PASSWORD_1,
      role: "ADMIN",
      name: "Master Admin",
    },
    {
      email: process.env.ADMIN_EMAIL_ID_2,
      password: process.env.ADMIN_PASSWORD_2,
      role: "ADMIN",
      name: "Master Admin",
    },
  ].filter((x) => x.email && x.password);

  for (const seed of seeds) {
    const email = String(seed.email).toLowerCase().trim();

    const exist = await UserModel.findOne({ email }).lean();
    if (exist) {
      // keep role correct if already exists
      if (exist.role !== seed.role) {
        await UserModel.updateOne(
          { email },
          { $set: { role: seed.role, status: "Active" } }
        );
        console.log(`[seed] ♻ Updated role: ${email} -> ${seed.role}`);
      }
      continue;
    }

    const hash = await bcrypt.hash(String(seed.password), 10);

    await UserModel.create({
      name: seed.name,
      email,
      password: hash,
      role: seed.role, // ADMIN / MASTER_ADMIN
      provider: "local",
      verify_email: true,
      status: "Active",
    });

    console.log(`[seed] ✅ Created ${seed.role}: ${email}`);
  }
}

/* -----------------------------
 * Start
 * ----------------------------- */
connectDB()
  .then(async () => {
    await ensureDefaultAdmins();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`✅ ENV: ${NODE_ENV}`);
      if (!isDev) console.log(`✅ Allowed Origins:`, allowedOrigins);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed:", err);
    process.exit(1);
  });

process.on("SIGINT", () => {
  console.log("\n🛑 Server shutting down gracefully...");
  process.exit(0);
});
