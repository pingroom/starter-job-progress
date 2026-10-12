export function shutdownSignal() {
  const controller = new AbortController();
  let watchdog;
  const interrupt = (name) => {
    if (controller.signal.aborted) return;
    process.exitCode = name === 'SIGINT' ? 130 : 143;
    controller.abort(new Error(`Job interrupted by ${name}.`));
    // Application steps must honor the signal. Exit after the cleanup window
    // even if an external operation or SDK request cannot be interrupted.
    watchdog = setTimeout(() => process.exit(process.exitCode), 5_000);
    watchdog.unref();
  };
  const onInt = () => interrupt('SIGINT');
  const onTerm = () => interrupt('SIGTERM');
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  return {
    signal: controller.signal,
    dispose() {
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
      // Keep an interrupted process's watchdog while unabortable I/O drains.
      if (!controller.signal.aborted) clearTimeout(watchdog);
    },
  };
}
