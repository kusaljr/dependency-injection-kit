export class RaceLockService {
  private locks: Map<string, boolean> = new Map();
  runWithLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (this.locks.get(key)) {
        return reject(new Error(`Lock for ${key} is already acquired`));
      }

      this.locks.set(key, true);

      fn()
        .then((result) => {
          this.locks.delete(key);
          resolve(result);
        })
        .catch((error) => {
          this.locks.delete(key);
          reject(error);
        });
    });
  }
}
