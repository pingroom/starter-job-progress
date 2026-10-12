import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PingRoomError } from '@pingroom/sdk';
import { errorSummary } from '../src/errors.js';

test('API failures display only safe codes and status, never server message or body', () => {
  const error = new PingRoomError('Your bearer token is a-secret', { status: 403, code: 'room_not_granted', body: { token: 'a-secret' } });
  assert.equal(errorSummary(error), 'PingRoom room_not_granted (HTTP 403).');
});
