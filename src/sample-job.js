import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export function sampleSteps(outputDirectory) {
  return [
    {
      label: 'Reading sample orders',
      async run({ signal }) {
        const raw = await readFile(new URL('../fixtures/orders.json', import.meta.url), { encoding: 'utf8', signal });
        return JSON.parse(raw);
      },
    },
    {
      label: 'Calculating order totals',
      async run({ value: orders, signal }) {
        signal.throwIfAborted();
        if (!Array.isArray(orders) || orders.some((order) => !Number.isSafeInteger(order.total_cents) || order.total_cents < 0)) {
          throw new Error('Sample orders must have nonnegative integer total_cents.');
        }
        return { order_count: orders.length, total_cents: orders.reduce((sum, order) => sum + order.total_cents, 0) };
      },
    },
    {
      label: 'Writing the summary',
      async run({ value: summary, signal }) {
        signal.throwIfAborted();
        await mkdir(outputDirectory, { recursive: true });
        const path = join(outputDirectory, 'summary.json');
        await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`, { signal });
        return { ...summary, path };
      },
    },
  ];
}
