import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/Logger';

import { jobManager } from './JobManager';

export class CleanupService {
  private logger = new Logger('CleanupService');

  constructor() {
    // Run cleanup every 30 minutes
    setInterval(async () => {
      await this.cleanupTempFiles();
      await jobManager.cleanup();
    }, 1800000);
  }

  async cleanupTempFiles() {
    this.logger.info('Starting scheduled cleanup...');
    const uploadDir = path.join(__dirname, '../../public/uploads');

    if (!fs.existsSync(uploadDir)) return;

    try {
      const files = await fs.promises.readdir(uploadDir);
      const now = Date.now();
      const expirationTime = 24 * 60 * 60 * 1000; // 24 hours

      for (const file of files) {
        const filePath = path.join(uploadDir, file);
        const stats = await fs.promises.stat(filePath);

        if (now - stats.mtimeMs > expirationTime) {
          await fs.promises.unlink(filePath);
          this.logger.info(`Deleted expired file: ${file}`);
        }
      }
    } catch (error) {
      this.logger.error('Cleanup failed', error);
    }
  }
}

export const cleanupService = new CleanupService();
