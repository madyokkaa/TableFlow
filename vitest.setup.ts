import { config } from "dotenv";

config({ path: ".env.local" });

// Tests call route handlers back to back from one "IP" - the per-IP limits
// would trip. tests/rateLimit.test.ts switches it back on explicitly.
process.env.RATE_LIMIT_DISABLED ??= "1";
