export class Logger {
  private startTime: number;

  constructor(private context: string) {
    this.startTime = Date.now();
  }

  info(message: string, data?: any) {
    console.log(`[INFO] [${this.context}] ${message}`, data || '');
  }

  warn(message: string, data?: any) {
    console.warn(`[WARN] [${this.context}] ${message}`, data || '');
  }

  error(message: string, error?: any) {
    console.error(`[ERROR] [${this.context}] ${message}`, error || '');
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }

  getMemoryUsage(): number {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  logPerformance() {
    this.info(`Completed in ${this.getDuration()}ms. Memory used: ${this.getMemoryUsage()}MB`);
  }
}
