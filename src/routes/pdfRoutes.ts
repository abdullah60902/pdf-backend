import { Router } from 'express';
import upload from '../middleware/multerConfig';
import * as pdfController from '../controllers/PdfController';

const router = Router();

router.post('/merge', upload.any(), pdfController.mergePDFs);
router.post('/split', upload.any(), pdfController.splitPDF);
router.post('/compress', upload.any(), pdfController.compressPDF);
router.post('/rotate', upload.any(), pdfController.rotatePDF);
router.post('/analyze-rotation', upload.any(), pdfController.analyzeRotation);
router.post('/delete-pages', upload.any(), pdfController.deletePages);

// Watermark and Signature tools
router.post('/watermark', upload.any(), pdfController.addWatermark);
router.post('/sign', upload.any(), pdfController.addSignature);

// Document conversion tools
import { documentController } from '../controllers/DocumentController';
import { validateFileUpload, validateFileSize, validateMimeType } from '../middleware/validation/fileValidation';
import { conversionRateLimiter } from '../middleware/rateLimiter';

router.post(
  '/pdf-to-word',
  upload.any(),
  validateFileUpload,
  validateFileSize(10 * 1024 * 1024), // 10MB
  validateMimeType(['application/pdf']),
  documentController.pdfToWord
);
router.post(
  '/word-to-pdf',
  conversionRateLimiter,
  upload.any(), // Accept any field name to support both single and bulk uploads
  documentController.wordToPdf
);



router.get('/status/:jobId', documentController.getJobStatus);
router.get('/health', documentController.checkHealth);


// PDF Editor
router.post('/edit', upload.any(), pdfController.editPDF);

// Cleanup Cloudinary Storage
import express from 'express';
router.post('/cleanup', express.json(), pdfController.cleanupFile);

export default router;
