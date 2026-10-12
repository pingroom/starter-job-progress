import assert from 'node:assert/strict';
import { test } from 'node:test';
import { performance } from 'node:perf_hooks';
import { PingRoom } from '@pingroom/sdk';
import { runJob } from '../src/run-job.js';

function setup(onPush = () => {}) {
  const sent = [];
  const client = new PingRoom({
    token: 'offline-test', baseUrl: 'https://offline.invalid', timeoutMs: 100,
    async fetch(url, options) {
      assert.equal(new URL(url).pathname, '/api/agent/rooms/test-room/live');
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      sent.push(body);
      await onPush(body, sent.length);
      return new Response(JSON.stringify({ notification_id: 'notification', correlation_id: body.correlation_id, state: body.live_status.state, idempotent: false }), {
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  return { client, room: 'test-room', jobId: 'test-job', sent };
}

test('real SDK sends one stream, passes step values, and ends successfully', async () => {
  const job = setup();
  const result = await runJob({ ...job, steps: [
    { label: 'Read', run: async () => 3 },
    { label: 'Calculate', run: async ({ value }) => value * 2 },
  ] });
  assert.equal(result.value, 6);
  assert.equal(result.completionSent, true);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(job.sent.map((ping) => ping.live_status.state), ['running', 'done']);
  assert.ok(job.sent.every((ping) => ping.correlation_id === 'test-job'));
});

test('task failure sends a generic failed card and preserves the exact error when cleanup fails', async () => {
  const original = new Error('Sensitive application failure');
  const job = setup((body) => {
    if (body.live_status.state === 'failed') throw new Error('Network failure');
  });
  await assert.rejects(runJob({ ...job, steps: [{ label: 'Work', run: async () => { throw original; } }] }), (error) => error === original);
  assert.equal(job.sent.at(-1).live_status.message, 'Job failed');
  assert.equal(JSON.stringify(job.sent).includes(original.message), false);
});

test('an interrupted step prevents later steps and sends a failed card', async () => {
  const controller = new AbortController();
  const reason = new Error('Stop');
  const job = setup();
  let nextStepRan = false;
  await assert.rejects(runJob({ ...job, signal: controller.signal, steps: [
    { label: 'Cancel', run: async () => controller.abort(reason) },
    { label: 'Must not run', run: async () => { nextStepRan = true; } },
  ] }), (error) => error === reason);
  assert.equal(nextStepRan, false);
  assert.equal(job.sent.at(-1).live_status.message, 'Job interrupted');
});

test('cleanup has a deadline even when the transport never settles', async () => {
  const original = new Error('Job failed first');
  const job = setup((body) => body.live_status.state === 'failed' ? new Promise(() => {}) : undefined);
  await assert.rejects(runJob({ ...job, cleanupTimeoutMs: 20, steps: [{ label: 'Work', run: async () => { throw original; } }] }), (error) => error === original);
});

test('progress update failures do not prevent work or the completion update', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const job = setup((_, count) => { if (count === 2) throw new Error('Update failed'); });
  const result = await runJob({ ...job, steps: [
    { label: 'First step', run: async () => { now = 12_000; return 7; } },
    { label: 'Second step', run: async ({ value }) => value + 1 },
  ] });
  assert.equal(result.value, 8);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.completionSent, true);
  assert.deepEqual(job.sent.map((ping) => ping.live_status.state), ['running', 'running', 'done']);
  assert.equal(job.sent[1].live_status.progress, 0.5);
});

test('successful work remains successful when the final notification fails', async () => {
  const job = setup((body) => { if (body.live_status.state === 'done') throw new Error('Offline'); });
  const result = await runJob({ ...job, steps: [{ label: 'Work', run: async () => 'saved' }] });
  assert.equal(result.value, 'saved');
  assert.equal(result.completionSent, false);
  assert.equal(result.warnings.length, 1);
});

test('failed stream creation prevents application work and attempts cleanup', async () => {
  const job = setup((_, count) => { if (count === 1) throw new Error('Create failed'); });
  let ran = false;
  await assert.rejects(runJob({ ...job, steps: [{ label: 'Work', run: async () => { ran = true; } }] }));
  assert.equal(ran, false);
  assert.deepEqual(job.sent.map((ping) => ping.live_status.state), ['running', 'failed']);
});

test('an already aborted job sends nothing', async () => {
  const job = setup();
  const reason = new Error('Already stopped');
  await assert.rejects(runJob({ ...job, signal: AbortSignal.abort(reason), steps: [{ label: 'Work', run: async () => 1 }] }), (error) => error === reason);
  assert.equal(job.sent.length, 0);
});
