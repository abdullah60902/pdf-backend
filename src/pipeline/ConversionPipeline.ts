import { Logger } from '../utils/Logger';
import { storageService } from '../services/StorageService';
import { pdfService } from '../services/PdfService';
import { generateFileHash, sanitizeFilename } from '../utils/fileUtils';
import { PipelineResult, PipelineMetadata } from '../types/pipeline';
import { ValidationError, ConversionError, TimeoutError } from '../errors/AppError';
import { conversionSemaphore } from '../utils/Semaphore';

export class ConversionPipeline {
  private logger = new Logger('ConversionPipeline');

  // Basic in-memory cache for duplicate processing detection
  private static hashCache = new Map<string, string>();

  async processPdfToWord(file: Express.Multer.File): Promise<PipelineResult<any>> {
    const logger = new Logger(`Job-${Date.now()}`);

    try {
      // 1. Validation
      if (!file) throw new ValidationError('No file provided');
      if (file.mimetype !== 'application/pdf') throw new ValidationError('Only PDF files are supported');

      const buffer = file.buffer || await storageService.readFile(file.path);

      // 2. Hash & Duplicate Check
      const hash = generateFileHash(buffer);
      if (ConversionPipeline.hashCache.has(hash)) {
        logger.info('Duplicate detected, returning cached URL');
        return {
          success: true,
          file_url: ConversionPipeline.hashCache.get(hash),
          performance: {
            processing_time_ms: logger.getDuration(),
            memory_used_mb: logger.getMemoryUsage(),
          },
          hash
        };
      }

      // 3. Metadata Extraction (Analyze PDF structure)
      logger.info('Analyzing PDF structure...');
      const metadata = await pdfService.getMetadata(buffer);

      // 4. Conversion with Timeout
      logger.info('Starting conversion (waiting for slot)...');
      await conversionSemaphore.acquire();

      let docxBuffer: Buffer;
      try {
        const conversionPromise = pdfService.convertToDocx(buffer);

        // 60-second timeout for large files
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new TimeoutError('Conversion timed out')), 60000)
        );

        docxBuffer = await Promise.race([conversionPromise, timeoutPromise]) as Buffer;
      } finally {
        conversionSemaphore.release();
      }

      // 5. Store Result
      const safeName = sanitizeFilename(file.originalname).replace(/\.pdf$/i, '.docx');
      const uploadResult = await storageService.uploadBuffer(docxBuffer, safeName, 'docx');

      const result: PipelineResult<any> = {
        success: true,
        file_url: uploadResult.secure_url,
        metadata: metadata,
        performance: {
          processing_time_ms: logger.getDuration(),
          memory_used_mb: logger.getMemoryUsage(),
        },
        hash
      };

      // 6. Cache Result
      ConversionPipeline.hashCache.set(hash, uploadResult.secure_url);

      logger.logPerformance();
      return result;

    } catch (error) {
      logger.error('Pipeline failed', error);
      throw error;
    }
  }
}

export const conversionPipeline = new ConversionPipeline();
