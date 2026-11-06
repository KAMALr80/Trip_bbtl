import { z } from "zod";

// Zod 4 tries `new Function("")` to see whether it can compile faster parsers. Under a Content
// Security Policy without 'unsafe-eval' that attempt raises a violation report on every load, and the
// speed-up is negligible for the small schemas here (B-28).
//
// The attempt happens when a schema is created, so code that creates schemas in the browser imports
// `z` from here, not from "zod". package.json lists this file under "sideEffects"; without that the
// bundler goes straight to "zod" and drops this call. e2e/pwa/headers.spec.ts fails if either slips.
z.config({ jitless: true });

export { z };
