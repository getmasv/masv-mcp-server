// Loaded via `node --test --import ./test/setup.ts` before any test module.
//
// teamId() and apiKey() in src/api/env.ts throw when their variables are unset, so
// any code path that builds a request needs these present.
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

// Cleared so the delete gate starts closed. deleteAllowed() reads it per call, so a
// test that needs it open sets the variable and restores it in t.after().
delete process.env.MASV_ALLOW_DELETE;
