import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { storageService } from '../services/StorageService';
import { Logger } from '../utils/Logger';

const logger = new Logger('BgRemoverController');

// RemBG Docker container on DigitalOcean server
const REMBG_URL = process.env.REMBG_URL || 'http://188.166.241.174:5000';

export const removeBackground = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file as Express.Multer.File;
    const files = req.files as Express.Multer.File[];
    const targetFile = file || (files && files[0]);

    if (!targetFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    logger.info(`Removing background from: ${targetFile.originalname}`);

    // Extract advanced pro options from request body
    const { model, a, ae, af, ab, om, ppm } = req.body;

    // Read the file from disk (multer stores to disk)
    const filePath = targetFile.path;
    const fileBuffer = await fs.promises.readFile(filePath);

    // Build form data to send to RemBG API
    // Exact string match as requested for 100% Professional Locked Confidence
    // ab=15 makes it strictly sensitive so gradients don't get erased
    // Using ISNet-General-Use for industrial quality (Works with Swap File on 1GB RAM)
    const apiUrl = `${REMBG_URL}/api/remove?model=isnet-general-use&a=true&ab=15&ae=1&af=240&az=1000`;
    
    logger.info(`Running High-Accuracy ISNet Automatic Magic: ${apiUrl}`);

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: targetFile.originalname,
      contentType: targetFile.mimetype,
    });

    // Send to RemBG using multipart/form-data wrapper
    const rembgResponse = await axios.post(apiUrl, formData, {
      headers: { ...formData.getHeaders() },
      responseType: 'arraybuffer',
      timeout: 300000 // 5 minutes wait allowed for first time model download
    });

    const processedBuffer = Buffer.from(rembgResponse.data);

    // Generate output filename
    const originalName = path.parse(targetFile.originalname).name;
    const outputName = `${originalName}_no-bg.png`;

    // Upload to Cloudinary for download link
    const uploadResult = await storageService.uploadBuffer(processedBuffer, outputName, 'png');

    logger.info(`Background removed successfully: ${outputName}`);

    // Clean up temp file
    try {
      await fs.promises.unlink(filePath);
    } catch (e) {
      // ignore cleanup errors
    }

    res.json({
      success: true,
      message: 'Background removed successfully',
      downloadUrl: uploadResult.secure_url,
      originalName: targetFile.originalname,
      outputName: outputName,
      size: uploadResult.bytes,
    });
  } catch (error: any) {
    logger.error('Background removal error', error);

    // Provide user-friendly error messages
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        error: 'Background removal service is currently unavailable. Please try again later.',
      });
    }

    if (error.response?.status === 413) {
      return res.status(413).json({
        error: 'Image file is too large. Please use a smaller image.',
      });
    }

    res.status(500).json({
      error: error.message || 'Failed to remove background',
    });
  }
};
