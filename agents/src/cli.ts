// Command line for the agents.
//
//   npm run status -- <lease id> [tenant|landlord|arbiter]
//   npm run explain -- <lease id> "<rule or question>"
//   npm run history -- <lease id>
//   npm run coordinator [-- --once]

import { runLoop } from "./coordinator.js";
import { explainLeaseRule, getLeaseStatus, getRentHistory } from "./tools.js";
import { when, type Role } from "./rules.js";
import { explorer } from "./chain.js";

const [cmd, ...rest] = process.argv.slice(2);

async function main() {
  switch (cmd) {
    case "status": {
      const id = BigInt(rest[0] ?? 0);
      const role = (rest[1] ?? "tenant") as Role;
      const s = await getLeaseStatus(id, role);
      const now = Math.floor(Date.now() / 1000);
      console.log(`Lease #${id} (${role} view): ${s.headline}`);
      s.facts.forEach((f) => console.log(`  · ${f}`));
      s.deadlines.forEach((d) => console.log(`  ⏱ ${d.label}: ${when(d.at, now)}`));
      s.youCan.forEach((a) => console.log(`  ✓ ${a}`));
      s.notYet.forEach((b) => console.log(`  ✗ ${b}`));
      break;
    }
    case "explain": {
      const r = await explainLeaseRule(BigInt(rest[0] ?? 0), rest.slice(1).join(" "));
      console.log(r.rule ? `[${r.rule}] ${r.text}` : r.text);
      break;
    }
    case "history": {
      for (const h of await getRentHistory(BigInt(rest[0] ?? 0))) {
        console.log(`${h.at}  ${h.text}\n    ${explorer(h.tx)}`);
      }
      break;
    }
    case "coordinator":
      await runLoop(rest.includes("--once"));
      break;
    default:
      console.log("Commands: status <id> [role] | explain <id> <question> | history <id> | coordinator [--once]");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
