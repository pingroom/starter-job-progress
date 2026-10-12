import { PingRoomError, PingRoomNetworkError, PingRoomTimeoutError } from '@pingroom/sdk';

export function errorSummary(error) {
  // Server response bodies and transport errors can contain sensitive values.
  if (error instanceof PingRoomError) {
    const code = typeof error.code === 'string' && /^[a-z0-9_]+$/.test(error.code) ? error.code : 'request_failed';
    return `PingRoom ${code}${Number.isInteger(error.status) ? ` (HTTP ${error.status})` : ''}.`;
  }
  if (error instanceof PingRoomNetworkError || error instanceof PingRoomTimeoutError) {
    return 'PingRoom could not be reached before the request deadline.';
  }
  return error instanceof Error ? error.message : 'The job failed.';
}
