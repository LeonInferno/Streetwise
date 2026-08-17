import { createApp } from "../src/app.js";

// Vercel serverless entrypoint. `createApp()` builds the Express app without
// calling app.listen() (see src/app.js), so it can be exported directly — an
// Express app is itself a callable (req, res) => void handler, which is what
// Vercel's Node runtime expects it to be. (Wrapping it with `serverless-http`
// instead, which targets AWS Lambda's event/context signature, is the wrong
// shape for Vercel and crashes on every invocation — that's the fix this
// replaced.) The startup checks in src/index.js (SUPABASE_URL/SUPABASE_SECRET_KEY/
// MONGODB_URI) do NOT run here on purpose: a serverless function can't
// process.exit() its way out of a bad deploy, so a missing var instead
// surfaces as a per-request 500 from the routes that need it.
export default createApp();
