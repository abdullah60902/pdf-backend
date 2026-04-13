import { Router } from 'express';
import upload from '../middleware/multerConfig';
import * as imageController from '../controllers/ImageController';

const router = Router();

// Handle common image conversions
router.post('/convert', upload.any(), imageController.convertImage);

// Formats can be passed as body or handled as query params if needed
router.post('/analyze', upload.any(), imageController.getMetadata);
router.post('/watermark', upload.any(), imageController.applyWatermark);

export default router;
