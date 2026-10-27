import { spawnSync } from 'node:child_process';
const [category, command, ...args] = process.argv.slice(2);
if (!category || process.env.CALLSIGN_ALLOW_EXTERNAL_EXECUTION !== category) {
  console.error(`BLOCKED: ${category ?? 'unknown'} 실행은 별도 사용자 승인 후에만 허용됩니다. docs/RUNBOOK.md 참고.`);
  process.exit(78);
}
if (!command) process.exit(64);
const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
