import { PingRoom } from '@pingroom/sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJob } from './run-job.js';
import { sampleSteps } from './sample-job.js';

// A real SDK client with a local transport. It never reads credentials or
// calls fetch: every request is handled below, or rejected as unexpected.
const client = new PingRoom({
  token: 'offline-demo',
  baseUrl: 'https://offline.invalid',
  async fetch(url, options) {
    if (new URL(url).pathname !== '/api/agent/rooms/demo-room/live' || options.method !== 'POST') {
      throw new Error('Unexpected offline demo request.');
    }
    const ping = JSON.parse(options.body);
    console.log(`[simulated card] ${ping.live_status.state}: ${ping.live_status.message}`);
    return new Response(JSON.stringify({
      notification_id: 'demo-notification', correlation_id: ping.correlation_id,
      state: ping.live_status.state, idempotent: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  },
});
const directory = await mkdtemp(join(tmpdir(), 'pingroom-progress-'));
try {
  const result = await runJob({ client, room: 'demo-room', steps: sampleSteps(directory) });
  console.log(JSON.stringify({ order_count: result.value.order_count, total_cents: result.value.total_cents, completionSent: result.completionSent }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
