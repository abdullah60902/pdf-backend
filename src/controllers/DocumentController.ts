
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
      
      const outDir = process.env.NODE_ENV === 'production' || process.platform === 'linux' 
        ? '/root/pdf-backend/temp' 
        : os.tmpdir();

      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }

      const inputPath = path.join(outDir, `input_${jobId}${ext}`);
      const profilePath = path.join(outDir, `lo_profile_${jobId}`);
      
      // Copy uploaded file to the deterministic /tmp location
      fs.copyFileSync(targetFile.path, inputPath);

      // Execute LibreOffice command natively. We use a custom UserInstallation profile
      // so that libreoffice never detaches even if another instance is running.
      const cmd = `libreoffice -env:UserInstallation=file://${profilePath} --headless --nologo --norestore --convert-to pdf --outdir "${outDir}" "${inputPath}"`;
      await execPromise(cmd);

      const baseName = path.basename(inputPath, ext);
      const outputPath = path.join(outDir, `${baseName}.pdf`);

      if (!fs.existsSync(outputPath)) {
        throw new Error(`File conversion failed, output file does not exist at ${outputPath}`);
      }

      const fileName = targetFile.originalname.replace(/\.(docx|doc)$/i, '.pdf');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Stream file directly to prevent early deletion or memory issues
      res.sendFile(outputPath, (err) => {
        // Strict Cleanup AFTER sending finishes
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        if (targetFile.path && fs.existsSync(targetFile.path)) {
          fs.unlinkSync(targetFile.path);
        }
        if (fs.existsSync(profilePath)) {
          fs.rmSync(profilePath, { recursive: true, force: true });
        }
      });

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
      const { exec } = require('child_process');
      const util = require('util');
      const execPromise = util.promisify(exec);

      this.logger.info(`Converting PDF to DOCX natively via LibreOffice...`);
      
      const jobId = Date.now() + Math.floor(Math.random() * 1000);
      
      // Linux server par /tmp folder hamesha zyada stable hota hai permissions ke liye
      const outDir = '/tmp/pdf_conv_' + jobId;
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

      const inputPath = path.join(outDir, `input.pdf`);
      const profilePath = path.join(outDir, `profile`);
      
      // Uploaded file ko naye folder mein move karein
      fs.copyFileSync(targetFile.path, inputPath);

      // Optimized Command: Filter ko hata kar simple rakha hai jo Linux par best kaam karta hai
      const cmd = `libreoffice -env:UserInstallation=file://${profilePath} --headless --invisible --nologo --norestore --convert-to docx --outdir "${outDir}" "${inputPath}"`;
      
      this.logger.info(`Running CMD: ${cmd}`);
      await execPromise(cmd);

      // LibreOffice output file ka naam "input.docx" rakhega
      const outputPath = path.join(outDir, `input.docx`);

      // Intezar karein ke file waqai ban gayi hai aur size 0 nahi hai
      if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
        throw new Error(`Conversion failed: Output file is missing or empty at ${outputPath}`);
      }

      const fileName = targetFile.originalname.replace(/\.pdf$/i, '.docx');

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      
      // Send file and THEN cleanup
      res.sendFile(outputPath, (err) => {
        if (err) this.logger.error(`Error sending file: ${err.message}`);
        
        // Safety delay to ensure file is sent before folder is deleted
        setTimeout(() => {
          try {
            if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });
            if (targetFile.path && fs.existsSync(targetFile.path)) fs.unlinkSync(targetFile.path);
            this.logger.info(`Cleanup successful for job ${jobId}`);
          } catch (cleanupErr: any) {
            this.logger.error(`Cleanup failed: ${cleanupErr.message}`);
          }
        }, 2000);
      });
    } catch (error: any) {
      this.logger.error(`Full Error: ${error.message}`);
      next(error);
    }
  };
}

export const documentController = new DocumentController();
