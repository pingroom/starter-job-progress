# PingRoom job progress starter

Put a Node.js job's progress on your phone. A reusable runner opens one PingRoom
live card, updates it between steps, and closes it with a completion or failure alert.
The included job reads four sample orders and writes a JSON summary.

## Try it offline

Requires Node.js 22 or newer. Choose **Use this template** on GitHub, or:

```sh
git clone https://github.com/pingroom/starter-job-progress.git
cd starter-job-progress
npm ci
npm run demo
npm test
```

The demo uses the real `@pingroom/sdk` with a simulated local transport. It reads
no credentials, makes no network requests, and removes its temporary output.
Installation needs npm access. Expected summary: 4 orders, 9,125 cents.

## Connect your phone

1. [Install PingRoom](https://pingroom.io/i), sign in, and create a standard private room you own.
2. Run `npm run connect`. Open the printed link, approve the robot, and grant access to that room.
3. Run `npm start`. Find the output in `output/summary.json` and the completed card in PingRoom.

Pairing saves the robot token in ignored `.pingroom/credentials.json`, with file
mode `0600` and directory mode `0700` on POSIX systems. Windows uses its filesystem
permissions; keep the checkout in your private user directory. Tokens remain on
the server or machine running the job. Reuse the displayed pairing link until it
expires; installing the app alone does not grant access.

For CI, supply both `PINGROOM_TOKEN` and `PINGROOM_ROOM` through your secret store.
The token is the `token` field saved during pairing; the room is the `room` field.
A complete environment pair overrides the saved connection; a partial pair is
rejected. For local environment configuration, copy `.env.example` to `.env`,
fill both values, and run `npm start`. Neither credential file is committed.

## Add your job

Replace the three steps in `src/sample-job.js`, or import the runner:

```js
import { PingRoom } from '@pingroom/sdk';
import { runJob } from './src/run-job.js';

const result = await runJob({
  client: new PingRoom({ token: process.env.PINGROOM_TOKEN, timeoutMs: 2_000 }),
  room: process.env.PINGROOM_ROOM,
  title: 'Nightly report',
  steps: [
    { label: 'Load rows', run: async ({ signal }) => loadRows({ signal }) },
    { label: 'Write report', run: async ({ value, signal }) => writeReport(value, { signal }) },
  ],
});
console.log(result.value, result.completionSent);
```

`loadRows` and `writeReport` are your application functions. Each step receives the
preceding step's return value and an `AbortSignal`. Split long work into meaningful
steps; the runner publishes progress at step boundaries, at most once every 11
seconds. A quick job may show only its start and completion. All steps execute
even when an intermediate progress update is skipped or fails.

The first card must be established before any job step runs. If that request
fails, the runner attempts cleanup and throws without starting work. A task error
triggers a generic failed card and is rethrown unchanged, even if cleanup fails.
Failure to send the final success card returns `completionSent: false` and a
`warnings` entry while preserving the successful job result. The sample CLI logs
that condition and exits successfully; use `completionSent` for stricter policy.

SIGINT/SIGTERM abort the sample job and allow up to three seconds for each cleanup
request; a five-second process watchdog bounds shutdown. Your steps must honor
their signal. SDK live sends do not accept a caller signal, so a timed-out request
can still finish remotely. The sample uses a two-second SDK request timeout, below
the runner's three-second wait; configure injected clients the same way to bound
local requests before cleanup. There are no automatic retries or guarantees of exactly-once
job execution. Every invocation gets a fresh stream ID. To build resume behavior,
persist your job state and inspect `client.live.get(room, jobId)` before continuing.

## Limits and troubleshooting

- Live publishing requires `pingroom:live:write`, a room granted to the robot, and
  the connected human to own that room. Being a room member alone is insufficient.
- Live updates are limited to approximately 6 per minute per stream and 10 new
  streams per minute per producer. Free agent accounts receive 5 new streams per
  day. Creation is the charged step; terminal `done`/`failed` updates bypass those
  rate and quota limits, but still require authorization and a working network.
- `403 room_not_granted`: grant the robot access to the room under **Connected Agents** in the app.
  `forbidden`: select a room owned by the connected human.
  `402 free_limit_reached`: wait for the daily limit to reset or use an eligible plan.
  `429`: space out new jobs; the runner already throttles intermediate updates.
- A stream belongs to the credential that created it. Another robot cannot finish
  it. Keep a valid connection for the entire job. Do not send raw exception text
  or secrets in step labels; labels appear in the room and on phones.
- Offline tests cover lifecycle requests, cancellation, cleanup deadlines, errors,
  and credentials. They do not verify real device delivery or app settings.

See the [SDK](https://github.com/pingroom/sdk),
[live status protocol](https://pingroom.io/liveactivities.md), and
[CLI](https://github.com/pingroom/cli).
Other templates: [CI approval](https://github.com/pingroom/starter-ci-approval) and
[human review](https://github.com/pingroom/starter-human-review).

MIT licensed. Dependencies are pinned; CI runs offline tests and the demo on Node 22 and 24.
