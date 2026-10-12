import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConnection, saveConnection } from '../src/config.js';
import { sampleSteps } from '../src/sample-job.js';

test('connection writes are private and complete environment credentials override them', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pingroom-test-'));
  try {
    await saveConnection(directory, { token: 'saved-token', room: 'saved-room' });
    assert.deepEqual(await loadConnection(directory, {}), { token: 'saved-token', room: 'saved-room' });
    if (process.platform !== 'win32') {
      assert.equal((await stat(join(directory, 'credentials.json'))).mode & 0o777, 0o600);
      assert.equal((await stat(directory)).mode & 0o777, 0o700);
    }
    assert.deepEqual(await loadConnection(directory, { PINGROOM_TOKEN: 'ci-token', PINGROOM_ROOM: 'ci-room' }), { token: 'ci-token', room: 'ci-room' });
    await assert.rejects(loadConnection(directory, { PINGROOM_TOKEN: 'incomplete' }), /Set both/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the sample job computes its fixture and writes a summary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pingroom-sample-'));
  try {
    let value;
    for (const step of sampleSteps(directory)) value = await step.run({ value, signal: new AbortController().signal });
    assert.equal(value.order_count, 4);
    assert.equal(value.total_cents, 9125);
    assert.ok((await stat(value.path)).isFile());
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('malformed credentials never appear in a parsing error', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pingroom-invalid-'));
  try {
    await writeFile(join(directory, 'credentials.json'), 'secret-token-not-json');
    await assert.rejects(loadConnection(directory, {}), (error) => error.message === 'Invalid local connection. Run npm run connect again.');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
