import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { liveStatus } from '@pingroom/sdk';

function bounded(operation, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('PingRoom update deadline elapsed.')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Run sequential application steps while publishing a single live card.
 * Each step receives the preceding step's value and a cancellation signal.
 * Notifications never replace an error thrown by the application step.
 */
export async function runJob({
  client,
  room,
  steps,
  title = 'Job progress',
  jobId = `job-${randomUUID()}`,
  signal = new AbortController().signal,
  updateIntervalMs = 11_000,
  cleanupTimeoutMs = 3_000,
}) {
  if (!client?.live?.push || !room || !Array.isArray(steps) || !steps.length
    || steps.some((step) => typeof step.run !== 'function' || typeof step.label !== 'string' || !step.label)
    || !Number.isFinite(updateIntervalMs) || updateIntervalMs < 10_000
    || !Number.isFinite(cleanupTimeoutMs) || cleanupTimeoutMs <= 0) {
    throw new Error('Supply a client, room, labeled steps, and valid notification deadlines.');
  }
  const warnings = [];
  let lastUpdate = -Infinity;
  let value;
  let started = false;
  const publish = (body) => bounded(() => client.live.push(room, body), cleanupTimeoutMs);
  const text = (value) => Array.from(value).slice(0, 120).join('');
  try {
    signal.throwIfAborted();
    // Establish monitoring before starting application work. A failed create
    // has an uncertain remote outcome, so attempt a terminal update on error.
    started = true;
    await publish(liveStatus.progress(jobId, {
      state: 'running', progress: 0, message: text(steps[0].label),
    }, { title: Array.from(title).slice(0, 40).join('') }));
    lastUpdate = performance.now();
    for (let index = 0; index < steps.length; index += 1) {
      signal.throwIfAborted();
      const step = steps[index];
      if (index > 0 && performance.now() - lastUpdate >= updateIntervalMs) {
        lastUpdate = performance.now();
        try {
          await publish(liveStatus.progress(jobId, {
            state: 'running', progress: index / steps.length, message: text(step.label),
          }));
        } catch (error) { warnings.push(error); }
      }
      signal.throwIfAborted();
      value = await step.run({ value, signal });
      signal.throwIfAborted();
    }
  } catch (error) {
    if (started) {
      try {
        // Do not send raw exception text: application errors may contain secrets.
        await publish(liveStatus.failed(jobId, signal.aborted ? 'Job interrupted' : 'Job failed'));
      } catch { /* The original task error remains the cause of failure. */ }
    }
    throw error;
  }

  let completionSent = true;
  try { await publish(liveStatus.done(jobId, 'Job complete')); }
  catch (error) { warnings.push(error); completionSent = false; }
  return { jobId, value, warnings, completionSent };
}
