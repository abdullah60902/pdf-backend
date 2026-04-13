
import { Logger } from '../utils/Logger';
import { engineConfig } from '../config/engineConfig';
import { Worker } from 'worker_threads';
import path from 'path';
import fs from 'fs-extra';
import PQueue from 'p-queue';
import { jobManager, JobStatus } from './JobManager';
import { storageService } from './StorageService';
import { LibreOfficeCrashError, TimeoutError, MemoryLimitError } from '../errors/AppError';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import { ResourceMonitor } from '../utils/resourceMonitor';
import axios from 'axios';
import FormData from 'form-data';

export class WordToPdfService {
  private logger = new Logger('WordToPdfService');
  private queue: PQueue;

  constructor() {
    this.queue = new PQueue({ concurrency: engineConfig.maxConcurrentJobs });
  }

  async convert(file: Express.Multer.File): Promise<string> {
    const jobId = jobManager.createJob(file.originalname);

    // Process in background
    this.processJob(jobId, file).catch(err => {
      this.logger.error(`Job ${jobId} failed in background`, err);
    });

    return jobId;
  }

  private async processJob(jobId: string, file: Express.Multer.File) {
    const startTime = Date.now();
    jobManager.updateJob(jobId, { status: JobStatus.PROCESSING });

    try {
      await this.queue.add(async () => {
        const tempOutput = path.join(engineConfig.tempDir, `${jobId}_output.pdf`);

        await fs.ensureDir(engineConfig.tempDir);

        // Use the file path from multer disk storage
        if (!file.path) {
          throw new Error('File path not found. Multer might be using memory storage.');
        }

        const result = await this.runConversionWorker(file.path, tempOutput, jobId);

        if (!result.success) {
          throw new LibreOfficeCrashError(result.error || 'Unknown LibreOffice error');
        }

        // Result Step - Only run heavy optimization/re-encoding if explicitly needed
        const rawBuffer = await fs.readFile(tempOutput);
        let finalPdfBuffer: any = rawBuffer;

        // Only trigger pdf-lib if we need to modify the structure (Watermark/Password)
        // or if explicitly requested. Re-saving with pdf-lib can sometimes simplify complex layouts.
        if (engineConfig.enableWatermark || engineConfig.enablePasswordProtection) {
          this.logger.info('Optimization step triggered for Watermark/Protection');
          finalPdfBuffer = await this.optimizePdf(rawBuffer as any);
        } else if (engineConfig.enableCompression) {
          this.logger.info('Using raw Gotenberg output (already optimized)');
        }

        const safeName = file.originalname.replace(/\.(docx|doc)$/i, '.pdf');
        const uploadResult = await storageService.uploadBuffer(finalPdfBuffer, safeName, 'pdf');
        let resultUrl = uploadResult.secure_url;
        let publicId = uploadResult.public_id;

        const endTime = Date.now();
        const memoryUsed = ResourceMonitor.getMemoryUsage();
        const cpuUsage = await ResourceMonitor.getCpuUsage();

        jobManager.updateJob(jobId, {
          status: JobStatus.COMPLETED,
          resultUrl: resultUrl,
          cloudinaryId: publicId,
          progress: 100,
          performance: {
            processing_time_ms: endTime - startTime,
            memory_used_mb: memoryUsed,
            cpu_usage_percent: cpuUsage
          }
        });
        // Cleanup temp files
        await fs.remove(tempOutput);
        // Delete original uploaded file from local disk (Multer)
        if (file.path && fs.existsSync(file.path)) {
          await fs.unlink(file.path);
        }
      });
    } catch (error: any) {
      this.logger.error(`Job ${jobId} processing error:`, error);
      jobManager.updateJob(jobId, {
        status: JobStatus.FAILED,
        error: error.message || 'Conversion failed'
      });
    }
  }

  private async runConversionWorker(inputPath: string, outputPath: string, jobId: string, fileOriginalName: string = 'document.docx'): Promise<{ success: boolean; error?: string }> {
    try {
      this.logger.info(`🚀 [Micro-Tool] Converting using Local Gotenberg Engine...`);
      const formData = new FormData();
      formData.append('files', fs.createReadStream(inputPath), fileOriginalName);

      const response = await axios.post(`${engineConfig.gotenbergUrl}/forms/libreoffice/convert`, formData, {
        headers: { ...formData.getHeaders() },
        responseType: 'arraybuffer',
        timeout: engineConfig.timeoutDurationMS,
      });

      await fs.writeFile(outputPath, Buffer.from(response.data));
      this.logger.info(`✅ Gotenberg conversion successful!`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`❌ Gotenberg failed: ${error.message}`);
      return { success: false, error: 'Conversion failed: Remote conversion server (Gotenberg) error.' };
    }
  }

  private async optimizePdf(buffer: any): Promise<any> {
    try {
      this.logger.info('Optimizing PDF structure...');
      // Use Uint8Array to resolve Buffer/NonSharedBuffer compatibility issue
      const pdfDoc = await PDFDocument.load(new Uint8Array(buffer));

      pdfDoc.setTitle('');
      pdfDoc.setAuthor('Enterprise PDF Toolkit');
      pdfDoc.setProducer('Gotenberg + PDF-Lib');

      // Optional Watermark
      if (engineConfig.enableWatermark) {
        this.logger.info('Adding watermark...');
        const helveticaFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const pages = pdfDoc.getPages();

        for (const page of pages) {
          const { width, height } = page.getSize();
          page.drawText('PROCESSED BY PDF-TOOLKIT', {
            x: width / 2 - 150,
            y: height / 2,
            size: 30,
            font: helveticaFont,
            color: rgb(0.8, 0.8, 0.8),
            opacity: 0.3,
            rotate: degrees(45)
          });
        }
      }

      return Buffer.from(await pdfDoc.save());
    } catch (error) {
      this.logger.error('Optimization failed', error);
      return buffer;
    }
  }
}

export const wordToPdfService = new WordToPdfService();
