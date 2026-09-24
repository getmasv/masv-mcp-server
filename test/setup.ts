// Loaded via `node --test --import ./test/setup.ts` before any test module.
//
// src/api/env.ts validates at import time and throws when MASV_TEAM_ID or
// MASV_API_KEY are missing, so every API module is unimportable without this.
//
// The values are forced, not defaulted. `npm test` must stay credential-free and
// offline even on a machine that exports real MASV_* vars in its shell; inheriting
// them would make the offline suite non-deterministic and could print a real team
// ID into a log. The live suite (phase 4) gets its own setup that reads the real
// credentials from the environment.
//
// api.test.invalid: `.invalid` is reserved by RFC 2606 and cannot resolve, so a
// request that escapes its fetch stub fails as a DNS error instead of quietly
// reaching a real host.
process.env.MASV_BASE_URL = "https://api.test.invalid";
process.env.MASV_TEAM_ID = "test-team";
process.env.MASV_API_KEY = "test-key";

// Cleared so the delete gate is closed by default. env.ts reads this once at import
// time, so a test cannot flip it mid-run; opening the gate needs a subprocess.
delete process.env.MASV_ALLOW_DELETE;
