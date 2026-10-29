import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
let failed = false;
for (const path of files.filter(p => /\.(ts|tsx|mjs|sql|ya?ml)$/.test(p))) {
  const source = readFileSync(path, 'utf8');
  if (/^(<{7}|={7}|>{7})/m.test(source)) { console.error(`Conflict marker: ${path}`); failed = true; }
  if (path.endsWith('.mjs')) execFileSync(process.execPath, ['--check', path]);
}
if (failed) process.exit(1);
console.log('Source hygiene and JavaScript syntax passed (not an ESLint audit).');
