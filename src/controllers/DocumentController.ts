
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
      
      const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
      const ext = path.extname(targetFile.originalname) || '.docx';
      
      const workDir = `/tmp/word_to_pdf_job_${uniqueId}`;
      const inputPath = path.join(workDir, `input${ext}`);
      const outputPath = path.join(workDir, 'input.pdf');

      try {
        // 1. Create temporary working directory
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

        // 2. Move uploaded file to our work directory
        // req.file.path is multer's temp path
        fs.renameSync(targetFile.path, inputPath);

        this.logger.info(`[INFO] Converting: ${inputPath}`);

        // 3. Run LibreOffice with unique profile to avoid crashes
        const command = `libreoffice --headless "-env:UserInstallation=file:///tmp/libo_profile_${uniqueId}" --nologo --norestore --convert-to pdf "${inputPath}" --outdir "${workDir}"`;
        
        await execPromise(command);

        // 4. Double check if file exists and has content
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            const fileName = targetFile.originalname.replace(/\.(docx|doc)$/i, '.pdf');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            res.sendFile(outputPath, (err) => {
                // 5. Cleanup AFTER sending the file
                setTimeout(() => {
                    fs.rmSync(workDir, { recursive: true, force: true });
                    const profilePath = `/tmp/libo_profile_${uniqueId}`;
                    if (fs.existsSync(profilePath)) fs.rmSync(profilePath, { recursive: true, force: true });
                    this.logger.info(`[CLEANUP] Job ${uniqueId} removed.`);
                }, 5000);
            });
        } else {
            throw new Error("LibreOffice output is empty or missing");
        }
      } catch (error: any) {
        this.logger.error(`[ERROR]:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Conversion failed", details: error.message });
        }
        // Cleanup on error too
        if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
        const profilePath = `/tmp/libo_profile_${uniqueId}`;
        if (fs.existsSync(profilePath)) fs.rmSync(profilePath, { recursive: true, force: true });
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
      
      const uniqueId = Date.now() + Math.floor(Math.random() * 1000);
      const workDir = `/tmp/pdf_job_${uniqueId}`;
      const inputPath = path.join(workDir, 'input.pdf');
      const outputPath = path.join(workDir, 'input.docx');

      try {
        // 1. Create temporary working directory
        if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true });

        // 2. Move uploaded file to our work directory
        // targetFile.path is multer's temp path
        fs.renameSync(targetFile.path, inputPath);

        this.logger.info(`[INFO] Converting: ${inputPath}`);

        // 3. Run LibreOffice with unique profile to avoid crashes
        const command = `libreoffice --headless "-env:UserInstallation=file:///tmp/libo_profile_${uniqueId}" --infilter="writer_pdf_import" --convert-to docx "${inputPath}" --outdir "${workDir}"`;
        
        await execPromise(command);

        // 4. Double check if file exists and has content
        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
            const fileName = targetFile.originalname.replace(/\.pdf$/i, '.docx');
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            
            res.sendFile(outputPath, (err) => {
                // 5. Cleanup AFTER sending the file
                setTimeout(() => {
                    fs.rmSync(workDir, { recursive: true, force: true });
                    const profilePath = `/tmp/libo_profile_${uniqueId}`;
                    if (fs.existsSync(profilePath)) fs.rmSync(profilePath, { recursive: true, force: true });
                    this.logger.info(`[CLEANUP] Job ${uniqueId} removed.`);
                }, 5000);
            });
        } else {
            throw new Error("LibreOffice output is empty or missing");
        }
      } catch (error: any) {
        this.logger.error(`[ERROR]:`, error);
        if (!res.headersSent) {
          res.status(500).json({ error: "Conversion failed", details: error.message });
        }
        // Cleanup on error too
        if (fs.existsSync(workDir)) fs.rmSync(workDir, { recursive: true, force: true });
        const profilePath = `/tmp/libo_profile_${uniqueId}`;
        if (fs.existsSync(profilePath)) fs.rmSync(profilePath, { recursive: true, force: true });
      }
    } catch (error) {
      next(error);
    }
  };
}

export const documentController = new DocumentController();
