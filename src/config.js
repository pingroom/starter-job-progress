import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function saveConnection(directory, connection) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const temporary = join(directory, `.connection-${randomUUID()}.json`);
  await writeFile(temporary, `${JSON.stringify(connection, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  await rename(temporary, join(directory, 'credentials.json'));
}

export async function loadConnection(directory, env = process.env) {
  const token = env.PINGROOM_TOKEN?.trim();
  const room = env.PINGROOM_ROOM?.trim();
  // Require a complete pair, so CI never combines one environment value
  // with a different locally connected robot or room.
  if (token || room) {
    if (!token || !room) throw new Error('Set both PINGROOM_TOKEN and PINGROOM_ROOM.');
    return { token, room };
  }
  try {
    const raw = await readFile(join(directory, 'credentials.json'), 'utf8');
    let saved;
    try { saved = JSON.parse(raw); }
    catch { throw new Error('Invalid local connection. Run npm run connect again.'); }
    if (!saved || typeof saved.token !== 'string' || !saved.token.trim()
      || typeof saved.room !== 'string' || !saved.room.trim()) {
      throw new Error('Invalid local connection. Run npm run connect again.');
    }
    return { token: saved.token, room: saved.room };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Run npm run connect, or set PINGROOM_TOKEN and PINGROOM_ROOM.');
    throw error;
  }
}
