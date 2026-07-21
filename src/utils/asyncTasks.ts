export function runInBackground(taskName: string, task: () => Promise<void>) {
  setImmediate(() => {
    task().catch((error) => {
      console.error(`[Background Task Error] ${taskName}`, error);
    });
  });
}
