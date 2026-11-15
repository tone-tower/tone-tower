import { open, readFile, mkdir, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const readOwner = async (file) => JSON.parse(await readFile(file, 'utf8'));
function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw Error('Invalid audio lock owner.');
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}

export async function withFileLock(task, file, { label = 'curation', inheritanceKey } = {}) {
  await mkdir(path.dirname(file), { recursive: true });
  const inherited = inheritanceKey ? process.env[inheritanceKey] : undefined;
  if (inherited) {
    const owner = await readOwner(file);
    if (owner.token !== inherited || !alive(owner.pid))
      throw Error('Invalid inherited operation lock.');
    return task(owner);
  }
  const owner = { pid: process.pid, token: randomUUID() };
  let lock;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lock = await open(file, 'wx');
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const previous = await readOwner(file).catch((error) => {
        if (error instanceof SyntaxError)
          throw Error(
            'Another ' +
              label +
              ' operation is starting, or its lock is incomplete. Retry after checking the owner.',
          );
        throw error;
      });
      if (alive(previous.pid))
        throw Error(
          'Another ' + label + ' operation is running (PID ' + previous.pid + '). Stop it first.',
        );
      // Serialize stale-lock recovery so concurrent starters cannot delete a new owner's lock.
      const recoveryPath = file + '.recovery';
      const recovery = await open(recoveryPath, 'wx');
      try {
        const current = await readOwner(file).catch((error) => {
          if (error.code !== 'ENOENT') throw error;
          return null;
        });
        if (current && current.token === previous.token && !alive(current.pid)) await unlink(file);
      } finally {
        await recovery.close();
        await unlink(recoveryPath);
      }
    }
  }
  if (!lock) throw Error('Could not acquire the operation lock. Try again.');
  try {
    await lock.writeFile(JSON.stringify(owner));
    await lock.close();
    return await task(owner);
  } finally {
    await lock.close().catch(() => {});
    const current = await readOwner(file);
    if (current.token === owner.token) await unlink(file);
  }
}
