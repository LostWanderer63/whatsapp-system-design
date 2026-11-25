require("dotenv").config({ quiet: true });

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing. Add it to .env (see .env.example).`);
  return value;
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: required("DB_USER"),
    password: process.env.DB_PASSWORD ?? "",
    name: process.env.DB_NAME || "chorus",
  },
  jwt: {
    secret: required("JWT_SECRET"),
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },
  socket: {
    port: Number(process.env.SOCKET_PORT) || 3000,
    origins: (process.env.CLIENT_ORIGINS || `http://localhost:5173,http://localhost:${Number(process.env.PORT) || 4000}`)
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
  },
  media: {
    bucket: process.env.S3_BUCKET || "",
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.S3_ENDPOINT || "",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    maxBytes: (Number(process.env.MEDIA_MAX_MB) || 25) * 1024 * 1024,
    urlTtlSeconds: Number(process.env.MEDIA_URL_TTL_SECONDS) || 12 * 60 * 60,
  },
  bcryptRounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
  defaultCountryCode: (process.env.DEFAULT_COUNTRY_CODE || "91").replace(/\D/g, ""),
};
