export class Semaphore {
  private queue: Array<() => void> = [];
  private activeCount = 0;

  constructor(private maxConcurrency: number) { }

  async acquire(): Promise<void> {
    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.activeCount--;
    if (this.queue.length > 0) {
      this.activeCount++;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export const conversionSemaphore = new Semaphore(2); // Limit to 2 parallel conversions to protect CPU
