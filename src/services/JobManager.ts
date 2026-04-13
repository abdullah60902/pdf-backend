
import crypto from 'crypto';

export enum JobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Job {
  id: string;
  status: JobStatus;
  progress: number;
  resultUrl?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  fileName: string;
  performance?: {
    processing_time_ms: number;
    memory_used_mb: number;
    cpu_usage_percent: number;
  };
  cloudinaryId?: string;
}

class JobManager {
  private jobs = new Map<string, Job>();

  createJob(fileName: string): string {
    const id = crypto.randomUUID();
    const job: Job = {
      id,
      status: JobStatus.PENDING,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      fileName
    };
    this.jobs.set(id, job);
    return id;
  }

  updateJob(id: string, updates: Partial<Job>) {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, updates, { updatedAt: new Date() });
    }
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  // Auto-cleanup old jobs (e.g., after 30 minutes)
  async cleanup() {
    const { storageService } = require('./StorageService');
    const expiryTime = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();

    for (const [id, job] of this.jobs.entries()) {
      if (now - job.updatedAt.getTime() > expiryTime) {
        if (job.cloudinaryId) {
          await storageService.deleteFromCloudinary(job.cloudinaryId);
        }
        this.jobs.delete(id);
      }
    }
  }
}

export const jobManager = new JobManager();
