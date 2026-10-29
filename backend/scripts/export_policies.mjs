// Copy FINEXT's policies from the app (frontend/src/content/policies.ts, the one place they are written) to the
// lender portal (backend/portal/policies.json), so bank staff read the same text as business owners.
//
//     node backend/scripts/export_policies.mjs
//
// Run it after editing the policies. Needs Node 22.18+ (it reads the TypeScript file directly).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { POLICIES, POLICY_ORDER } = await import('../../frontend/src/content/policies.ts');
const out = fileURLToPath(new URL('../portal/policies.json', import.meta.url));
writeFileSync(out, `${JSON.stringify(POLICY_ORDER.map((id) => POLICIES[id]), null, 1)}\n`);
console.log(`${POLICY_ORDER.length} policies written to ${out}`);
