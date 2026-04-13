
import os from 'os';

export class ResourceMonitor {
  static getMemoryUsage() {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }

  static getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = Date.now();

      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = Date.now();

        const totalUsage = (endUsage.user + endUsage.system) / 1000; // to ms
        const elapsed = endTime - startTime;
        const cpuPercent = Math.round((totalUsage / elapsed) * 100);

        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }
}
