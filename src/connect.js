import { PingRoom } from '@pingroom/sdk';
import { fileURLToPath } from 'node:url';
import { saveConnection } from './config.js';
import { shutdownSignal } from './signals.js';
import { errorSummary } from './errors.js';

const shutdown = shutdownSignal();
try {
  console.log('PingRoom brings job progress and completion alerts to your phone.');
  console.log('Install or open PingRoom and sign in: https://pingroom.io/i');
  const client = new PingRoom();
  const pairing = await client.auth.startPairing({ agent_label: 'Job progress starter' });
  console.log(`Approve this robot and select a private room you own: ${pairing.pair_browser_url ?? pairing.pair_url}`);
  const active = await client.auth.waitForPairing(pairing, { signal: shutdown.signal });
  const room = active.home_room ?? active.room;
  if (!room?.invite_code) {
    throw new Error('No delivery room was returned. Create a standard private room, then connect again.');
  }
  await saveConnection(fileURLToPath(new URL('../.pingroom/', import.meta.url)), {
    token: active.credential,
    room: room.invite_code,
  });
  console.log(`Connected to ${room.name ?? 'your selected room'}. Credentials saved in .pingroom/credentials.json.`);
} catch (error) {
  console.error(errorSummary(error));
  process.exitCode ||= 1;
} finally {
  shutdown.dispose();
}
