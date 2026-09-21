export class SerialQueue {
  private pending = new Map<string, Promise<unknown>>();
  run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(key);
    const result = previous ? previous.catch(() => {}).then(operation) : operation();
    this.pending.set(key, result);
    void result
      .finally(() => {
        if (this.pending.get(key) === result) this.pending.delete(key);
      })
      .catch(() => {});
    return result;
  }
}
