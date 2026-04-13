import { Request, Response } from 'express';
import { imageService } from '../services/ImageService';
import { storageService } from '../services/StorageService';
import { Logger } from '../utils/Logger';
import { GitHubDB } from '../utils/githubDb';
import path from 'path';
import fs from 'fs';

const logger = new Logger('ImageController');

export const convertImage = async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File;
    const files = req.files as Express.Multer.File[];
    const targetFile = file || (files && files[0]);

    const {
      targetFormat,
      quality,
      width,
      height,
      grayscale,
      negate,
      flip,
      flop,
      rotate,
      blur,
      sharpen
    } = req.body;

    if (!targetFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    if (!targetFormat) {
      return res.status(400).json({ error: 'Target format is required' });
    }

    logger.info(`Processing image: ${targetFile.originalname} to ${targetFormat}`);

    const options = {
      quality,
      width,
      height,
      grayscale: grayscale === 'true' || grayscale === true,
      negate: negate === 'true' || negate === true,
      flip: flip === 'true' || flip === true,
      flop: flop === 'true' || flop === true,
      rotate,
      blur,
      sharpen: sharpen === 'true' || sharpen === true
    };

    const buffer = targetFile.buffer || (targetFile.path ? await fs.promises.readFile(targetFile.path) : null);
    if (!buffer) throw new Error('File data not found');

    const convertedBuffer = await imageService.convertImage(buffer, targetFormat, options);

    const outputName = `${path.parse(targetFile.originalname).name}.${targetFormat}`;

    // Upload to Cloudinary
    const uploadResult = await storageService.uploadBuffer(convertedBuffer, outputName, targetFormat);

    // Save metadata
    try {
      await GitHubDB.saveMetadata({
        originalName: targetFile.originalname,
        cloudinaryId: uploadResult.public_id,
        url: uploadResult.secure_url,
        type: targetFormat,
        size: uploadResult.bytes,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    } catch (dbError) {
      logger.warn('Failed to save metadata to DB, continuing anyway');
    }

    res.json({
      success: true,
      message: 'Image converted successfully',
      downloadUrl: uploadResult.secure_url,
      format: targetFormat,
      size: uploadResult.bytes
    });

  } catch (error: any) {
    logger.error('Image conversion error', error);
    res.status(500).json({ error: error.message });
  }
};

export const getMetadata = async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File;
    const files = req.files as Express.Multer.File[];
    const targetFile = file || (files && files[0]);

    if (!targetFile) return res.status(400).json({ error: 'File is required' });

    const buffer = targetFile.buffer || (targetFile.path ? await fs.promises.readFile(targetFile.path) : null);
    if (!buffer) throw new Error('File data not found');

    const metadata = await imageService.getMetadata(buffer);

    res.json({ success: true, metadata });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
export const applyWatermark = async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const {
      type,
      text,
      opacity,
      gravity,
      rotate,
      color,
      tile,
      fontSize,
      font
    } = req.body;

    // Separate watermark image from target images
    const watermarkFile = files.find(f => f.fieldname === 'watermarkFile');
    const targetImages = files.filter(f => f.fieldname === 'targetImages');

    if (targetImages.length === 0) {
      return res.status(400).json({ error: 'At least one target image is required' });
    }

    if (type === 'image' && !watermarkFile) {
      return res.status(400).json({ error: 'Watermark image is required for image type' });
    }

    const watermarkOptions = {
      type,
      text,
      opacity,
      gravity,
      rotate,
      color,
      tile: tile === 'true' || tile === true,
      fontSize,
      font,
      watermarkImage: watermarkFile ? (watermarkFile.buffer || (watermarkFile.path ? await fs.promises.readFile(watermarkFile.path) : null)) : null
    };

    const results = [];

    for (const targetFile of targetImages) {
      try {
        const buffer = targetFile.buffer || (targetFile.path ? await fs.promises.readFile(targetFile.path) : null);
        if (!buffer) continue;

        const processedBuffer = await imageService.applyWatermark(buffer, watermarkOptions);

        // Use JPG as default export for consistency if output name is hard to guess
        const outputExt = path.parse(targetFile.originalname).ext || '.jpg';
        const outputName = `${path.parse(targetFile.originalname).name}_watermarked${outputExt}`;

        const uploadResult = await storageService.uploadBuffer(processedBuffer, outputName, outputExt.replace('.', '') || 'jpg');

        results.push({
          originalName: targetFile.originalname,
          url: uploadResult.secure_url,
          id: uploadResult.public_id
        });

        // Save metadata
        await GitHubDB.saveMetadata({
          originalName: targetFile.originalname,
          cloudinaryId: uploadResult.public_id,
          url: uploadResult.secure_url,
          type: outputExt.replace('.', ''),
          size: uploadResult.bytes,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).catch(() => { });

      } catch (err: any) {
        logger.error(`Failed to process ${targetFile.originalname}`, err);
      }
    }

    res.json({
      success: true,
      message: `Batch processed ${results.length} images`,
      results
    });

  } catch (error: any) {
    logger.error('Watermark batch error', error);
    res.status(500).json({ error: error.message });
  }
};
