import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { storageService } from '../services/StorageService';
import { Logger } from '../utils/Logger';
import { engineConfig } from '../config/engineConfig';

const logger = new Logger('GotenbergController');

// Gotenberg Docker container on DigitalOcean server (UNLIMITED)
const GOTENBERG_URL = engineConfig.gotenbergUrl;

export const wordToPdfGotenberg = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file as Express.Multer.File;
    const files = req.files as Express.Multer.File[];
    const allFiles = files ? files : file ? [file] : [];

    if (allFiles.length === 0) {
      return res.status(400).json({ error: 'Word file(s) required' });
    }

    const results = [];

    for (const targetFile of allFiles) {
      logger.info(`Converting via Gotenberg: ${targetFile.originalname}`);

      // Read the file from disk
      const filePath = targetFile.path;
      const fileBuffer = await fs.promises.readFile(filePath);

      // Build form data for Gotenberg LibreOffice endpoint
      const formData = new FormData();
      formData.append('files', fileBuffer, {
        filename: targetFile.originalname,
        contentType: targetFile.mimetype || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Send to Gotenberg - LibreOffice convert endpoint
      const gotenbergResponse = await axios.post(
        `${GOTENBERG_URL}/forms/libreoffice/convert`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          responseType: 'arraybuffer',
          timeout: 180000, // 3 min timeout
        }
      );

      const pdfBuffer = Buffer.from(gotenbergResponse.data);

      // Generate output filename
      const originalName = path.parse(targetFile.originalname).name;
      const outputName = `${originalName}.pdf`;

      // Upload to Cloudinary
      const uploadResult = await storageService.uploadBuffer(pdfBuffer, outputName, 'pdf');

      logger.info(`Gotenberg conversion successful: ${outputName}`);

      results.push({
        success: true,
        originalName: targetFile.originalname,
        downloadUrl: uploadResult.secure_url,
        size: uploadResult.bytes,
      });

      // Clean up temp file
      try {
        await fs.promises.unlink(filePath);
      } catch (e) {
        // ignore cleanup errors
      }
    }

    res.json({
      success: true,
      message: `Converted ${results.length} file(s) successfully`,
      downloadUrl: results.length === 1 ? results[0].downloadUrl : undefined,
      results,
    });
  } catch (error: any) {
    logger.error('Gotenberg conversion error', error);

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Gotenberg conversion service is currently unavailable. Please try again later.',
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to convert document',
    });
  }
};
