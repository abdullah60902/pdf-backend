import { config } from 'dotenv';
config({ override: true });
import { getLibreOfficePath } from '../utils/libreofficePath';

export const engineConfig = {
  maxFileSizeMB: 100,
  maxConcurrentJobs: 3,
  timeoutDurationMS: 120000, // 2 minutes
  enableCompression: true,
  enableWatermark: false,
  enablePasswordProtection: false,
  tempDir: 'temp/conversions',
  libreofficePath: getLibreOfficePath(), // Automatically find or use override
  gotenbergUrl: process.env.GOTENBERG_REMOTE_URL || process.env.GOTENBERG_URL || 'http://localhost:3000',
  pdfVersion: '1.7', // Default PDF version
  memoryLimitMB: 512, // Worker memory limit
  retryAttempts: 2
};
