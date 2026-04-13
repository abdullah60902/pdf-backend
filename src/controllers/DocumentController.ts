
import { Request, Response, NextFunction } from 'express';
import { wordToPdfService } from '../services/WordToPdfService';
import { jobManager, JobStatus } from '../services/JobManager';
import { Logger } from '../utils/Logger';
import { ValidationError } from '../errors/AppError';

export class DocumentController {
  private logger = new Logger('DocumentController');

  wordToPdf = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Express.Multer.File[];
      const file = req.file as Express.Multer.File;
      const allFiles = files ? files : (file ? [file] : []);

      if (allFiles.length === 0) {
        throw new ValidationError('No files provided');
      }

      const targetFile = allFiles[0];
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);

      this.logger.info(`Converting Word to PDF natively via LibreOffice...`);
      
      const jobId = Date.now() + Math.floor(Math.random() * 1000);
      const ext = path.extname(targetFile.originalname) || '.docx';
      const outDir = os.tmpdir();
      const inputPath = path.join(outDir, `input_${jobId}${ext}`);
      
      // Copy uploaded file to the deterministic /tmp location
      fs.copyFileSync(targetFile.path, inputPath);

      // Execute LibreOffice command natively
      const cmd = `soffice --headless --convert-to pdf --outdir ${outDir} ${inputPath}`;
      await execPromise(cmd);

      const baseName = path.basename(inputPath, ext);
      const outputPath = path.join(outDir, `${baseName}.pdf`);

      const pdfBuffer = fs.readFileSync(outputPath);
      const fileName = targetFile.originalname.replace(/\.(docx|doc)$/i, '.pdf');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(pdfBuffer);

      // Strict Cleanup
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (targetFile.path && fs.existsSync(targetFile.path)) {
        fs.unlinkSync(targetFile.path);
      }
    } catch (error) {
      next(error);
    }
  };

  getJobStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const job = jobManager.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      if (job.status === JobStatus.COMPLETED) {
        return res.json({
          success: true,
          pdf_url: job.resultUrl,
          performance: job.performance
        });
      }

      res.json({
        success: true,
        job
      });

    } catch (error) {
      next(error);
    }
  };

  checkHealth = async (req: Request, res: Response) => {
    const { engineConfig } = require('../config/engineConfig');
    const axios = require('axios');

    const health: any = {
      status: 'healthy',
      gotenberg: { url: engineConfig.gotenbergUrl, reachable: false },
    };

    // Check Gotenberg
    try {
      await axios.get(`${engineConfig.gotenbergUrl}/health`);
      health.gotenberg.reachable = true;
    } catch (err: any) {
      health.gotenberg.reachable = false;
      health.gotenberg.error = err.message;
      health.status = 'unhealthy';
    }

    res.json(health);
  };



  pdfToWord = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file as Express.Multer.File;
      const files = req.files as Express.Multer.File[];
      const targetFile = file || (files && files[0]);

      if (!targetFile) {
        throw new ValidationError('No PDF file provided');
      }

      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);

      this.logger.info(`Converting PDF to DOCX natively via LibreOffice...`);
      
      const jobId = Date.now() + Math.floor(Math.random() * 1000);
      const outDir = os.tmpdir();
      const inputPath = path.join(outDir, `input_${jobId}.pdf`);
      
      // Copy to /tmp
      fs.copyFileSync(targetFile.path, inputPath);

      // Execute LibreOffice command natively with writer_pdf_import block
      const cmd = `soffice --headless --infilter="writer_pdf_import" --convert-to docx --outdir ${outDir} ${inputPath}`;
      await execPromise(cmd);

      const baseName = path.basename(inputPath, '.pdf');
      const outputPath = path.join(outDir, `${baseName}.docx`);

      const docxBuffer = fs.readFileSync(outputPath);
      const fileName = targetFile.originalname.replace(/\.pdf$/i, '.docx');

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(docxBuffer);

      // Strict Cleanup
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      if (targetFile.path && fs.existsSync(targetFile.path)) {
        fs.unlinkSync(targetFile.path);
      }
    } catch (error) {
      next(error);
    }
  };
}

export const documentController = new DocumentController();
