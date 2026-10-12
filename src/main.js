import { PingRoom } from '@pingroom/sdk';
import { fileURLToPath } from 'node:url';
import { loadConnection } from './config.js';
import { runJob } from './run-job.js';
import { sampleSteps } from './sample-job.js';
import { shutdownSignal } from './signals.js';
import { errorSummary } from './errors.js';

const shutdown = shutdownSignal();
try {
  try { process.loadEnvFile('.env'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const { token, room } = await loadConnection(fileURLToPath(new URL('../.pingroom/', import.meta.url)));
  const result = await runJob({
    client: new PingRoom({ token, timeoutMs: 2_000 }),
    room,
    title: 'Order summary',
    steps: sampleSteps(fileURLToPath(new URL('../output/', import.meta.url))),
    signal: shutdown.signal,
  });
  console.log(JSON.stringify({ jobId: result.jobId, ...result.value, completionSent: result.completionSent }, null, 2));
  if (result.warnings.length) console.error(`${result.warnings.length} PingRoom update(s) failed. The job itself completed.`);
} catch (error) {
  console.error(errorSummary(error));
  process.exitCode ||= 1;
} finally {
  shutdown.dispose();
}
