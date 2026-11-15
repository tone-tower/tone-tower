import { spawnSync } from 'node:child_process';
// Inherit the loader in importer subprocesses, including temporary fixture projects.
const options = [process.env.NODE_OPTIONS, '--import=' + import.meta.resolve('tsx')]
  .filter(Boolean)
  .join(' ');
const result = spawnSync(
  process.execPath,
  ['--test', ...process.argv.slice(2), 'tests/tooling/*.test.js'],
  { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: options } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
