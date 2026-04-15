import { Request, Response } from 'express';
import { PDFDocument, rgb, degrees, StandardFonts, PDFName, PDFRawStream, PDFArray, PDFStream, BlendMode } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import cloudinary from '../utils/cloudinary';
import { GitHubDB, FileMetadataRecord } from '../utils/githubDb';
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
import FormData from 'form-data';
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);
const GOTENBERG_URL = 'http://localhost:3000';
const LIBREOFFICE_TEMP_DIR = '/root/pdf-backend/temp';

/**
 * ENTERPRISE PDF ENGINE TYPES
 */
interface AnalysisResult {
  pageNumber: number;
  currentRotation: number;
  suggestedRotation: number;
  confidenceScore: number;
  reason: string;
}

interface ProcessOutput {
  success: boolean;
  originalPages: number;
  processedPages: number;
  appliedFixes: AnalysisResult[];
  suggestedFixes: AnalysisResult[];
  warnings: string[];
  outputFileName: string;
  downloadUrl?: string;
}

/**
 * HARDENED RANGE PARSER
 * Standard: "1, 3, 5-10"
 */
class RangeParser {
  static validateAndParse(input: string, totalCount: number): number[] {
    if (!input) return [];
    const indices = new Set<number>();
    const parts = input.split(',').map(p => p.trim());

    for (const part of parts) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        if (isNaN(start) || isNaN(end) || start < 1 || end < start || end > totalCount) {
          throw new Error(`Out of bounds or invalid range: ${part}`);
        }
        for (let i = start; i <= end; i++) indices.add(i - 1);
      } else {
        const num = Number(part);
        if (isNaN(num) || num < 1 || num > totalCount) {
          throw new Error(`Out of bounds or invalid page: ${part}`);
        }
        indices.add(num - 1);
      }
    }
    return Array.from(indices).sort((a, b) => a - b);
  }
}


// Helper to upload buffer to Cloudinary
const uploadToCloudinary = async (buffer: Buffer, originalName: string, format: string = 'pdf'): Promise<any> => {
  try {
    console.log('☁️ Uploading to Cloudinary...');
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'pdf-toolkit',
          resource_type: 'raw',
          public_id: `${Date.now()}-${originalName.replace(/\.[^/.]+$/, "")}`,
          format: format
        },
        (error: any, result: any) => {
          if (error) {
            console.error('❌ Cloudinary Upload Error:', error);
            return reject(error);
          }
          console.log('✅ Cloudinary Upload Success:', result?.secure_url);
          resolve(result);
        }
      );
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error('❌ Upload Logic Error:', error);
    throw error;
  }
};

// Helper to save metadata (GitHub DB fallback)
const saveMetadata = async (data: FileMetadataRecord) => {
  try {
    const metadata = await GitHubDB.saveMetadata(data);
    return metadata;
  } catch (error) {
    console.warn('⚠️  Could not save metadata to GitHub DB:', (error as Error).message);
    return data; // Return the data object as fallback
  }
};

// Robust helper to load PDF data from either a local path or a remote URL
const loadPDFData = async (file: Express.Multer.File): Promise<Buffer> => {
  if (!file.path) throw new Error('File path is missing');

  // If it's a URL, fetch it. Otherwise read locally.
  if (file.path.startsWith('http')) {
    const response = await axios.get(file.path, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }

  return await fs.promises.readFile(file.path);
};

export const mergePDFs = async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length < 2) {
      return res.status(400).json({ error: 'At least two PDF files are required.' });
    }

    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
      const pdfData = await loadPDFData(file);
      const pdf = await PDFDocument.load(pdfData);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => mergedPdf.addPage(page));
    }

    const mergedPdfBytes = await mergedPdf.save();
    const uploadResult = await uploadToCloudinary(Buffer.from(mergedPdfBytes), 'merged.pdf');

    const metadata = await saveMetadata({
      originalName: 'merged.pdf',
      cloudinaryId: uploadResult.public_id,
      url: uploadResult.secure_url,
      type: 'pdf',
      size: uploadResult.bytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
    });

    res.json({ message: 'Success', downloadUrl: uploadResult.secure_url, metadata });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const splitPDF = async (req: Request, res: Response) => {
  try {
    const targetFile = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
    const { ranges } = req.body; // e.g., "1-3, 5, 8-10"
    if (!targetFile || !ranges) return res.status(400).json({ error: 'File and ranges are required' });

    const pdfData = await loadPDFData(targetFile);
    const srcPdf = await PDFDocument.load(pdfData);

    // Simple split logic: creates one PDF with selected pages
    const splitPdf = await PDFDocument.create();
    const pageIndices: number[] = [];

    ranges.split(',').forEach((range: string) => {
      const parts = range.trim().split('-');
      if (parts.length === 2) {
        for (let i = parseInt(parts[0]); i <= parseInt(parts[1]); i++) {
          pageIndices.push(i - 1);
        }
      } else {
        pageIndices.push(parseInt(parts[0]) - 1);
      }
    });

    const copiedPages = await splitPdf.copyPages(srcPdf, pageIndices);
    copiedPages.forEach(page => splitPdf.addPage(page));

    const splitPdfBytes = await splitPdf.save();
    const uploadResult = await uploadToCloudinary(Buffer.from(splitPdfBytes), 'split.pdf');

    const metadata = await saveMetadata({
      originalName: 'split.pdf',
      cloudinaryId: uploadResult.public_id,
      url: uploadResult.secure_url,
      type: 'pdf',
      size: uploadResult.bytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    res.json({ message: 'Success', downloadUrl: uploadResult.secure_url, metadata });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const compressPDF = async (req: Request, res: Response) => {
  try {
    const targetFile = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
    const { mode = 'Recommended' } = req.body;
    if (!targetFile) return res.status(400).json({ error: 'File is required' });

    const pdfData = await loadPDFData(targetFile);
    const pdfDoc = await PDFDocument.load(pdfData);

    // Deep Compression Engine: Image Optimization
    const objects = pdfDoc.context.enumerateIndirectObjects();
    const tasks: (() => Promise<void>)[] = [];

    for (const [ref, obj] of objects) {
      if (obj instanceof PDFRawStream && obj.dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) {
        const dict = obj.dict;
        const filter = dict.get(PDFName.of('Filter'));

        // World-Class Logic: Target DCTDecode (JPEG) for safest re-compression
        if (filter !== PDFName.of('DCTDecode')) continue;

        const targetRef = ref;
        const targetObj = obj;

        tasks.push(async () => {
          try {
            if (!targetObj.contents || targetObj.contents.length < 5000) return;
            const buffer = Buffer.from(targetObj.contents);

            let q = 75;
            let maxWidth = 1200;
            if (mode === 'Extreme') { q = 50; maxWidth = 800; }
            else if (mode === 'Basic') { q = 85; maxWidth = 1600; }

            const optimized = await sharp(buffer)
              .resize({ width: maxWidth, withoutEnlargement: true })
              .jpeg({ quality: q, mozjpeg: true })
              .toBuffer();

            const newStream = PDFRawStream.of(dict, new Uint8Array(optimized));
            pdfDoc.context.assign(targetRef, newStream);
          } catch (imgErr) {
            console.warn('Image skip:', imgErr);
          }
        });
      }
    }

    // Parallel processing for SaaS performance
    // Process tasks in small batches for environment stability
    const BATCH_SIZE = 5;
    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
      const batch = tasks.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(task => task()));
    }

    const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: true });

    // Robust Sanitization: remove spaces and non-safe chars
    const safeName = targetFile.originalname.replace(/[^a-z0-9.]/gi, '_').replace(/_{2,}/g, '_');
    const uploadResult = await uploadToCloudinary(Buffer.from(compressedPdfBytes), safeName);

    const metadata = await saveMetadata({
      originalName: targetFile.originalname,
      cloudinaryId: uploadResult.public_id,
      url: uploadResult.secure_url,
      type: 'pdf',
      size: uploadResult.bytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    res.json({
      message: 'Success',
      downloadUrl: uploadResult.secure_url,
      metadata,
      stats: {
        originalSize: targetFile.size,
        compressedSize: uploadResult.bytes,
        reduction: Math.round((1 - uploadResult.bytes / targetFile.size) * 100) + '%'
      }
    });
  } catch (error: any) {
    console.error('CRITICAL Compression Error:', error);
    res.status(500).json({ error: `System Engine Error: ${error.message}` });
  }
};

/**
 * INDUSTRIAL ANALYSIS ENGINE
 * Heuristic metadata analysis + text flow detection
 */
async function performSmartAnalysis(pdfBuffer: Buffer): Promise<AnalysisResult[]> {
  try {
    const loadingTask = pdfjs.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    const auditResults: AnalysisResult[] = [];

    const pageGeos = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const { width, height } = page.getViewport({ scale: 1 });
      pageGeos.push({ width, height, rotation: page.rotate || 0 });
    }

    const portraitCount = pageGeos.filter(g => g.width <= g.height).length;
    const dominantLayout = portraitCount >= numPages / 2 ? 'portrait' : 'landscape';

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const { width, height } = page.getViewport({ scale: 1 });
      const currentRot = page.rotate || 0;

      let confidence = 0.5;
      let suggestion = currentRot;
      let reason = "Orientation appears consistent";

      const currentLayout = width <= height ? 'portrait' : 'landscape';
      if (dominantLayout === 'portrait' && currentLayout === 'landscape') {
        suggestion = (currentRot + 90) % 360;
        confidence = 0.80;
        reason = "Outlier orientation detected";
      }

      try {
        const textContent = await page.getTextContent();
        if (textContent.items.length > 0) {
          let rotatedTextCount = 0;
          let normalTextCount = 0;
          textContent.items.slice(0, 80).forEach((item: any) => {
            const t = item.transform;
            if (Math.abs(t[1]) > Math.abs(t[0])) rotatedTextCount++;
            else normalTextCount++;
          });
          if (rotatedTextCount > (normalTextCount * 1.5)) {
            confidence = 0.95;
            suggestion = (currentRot + 90) % 360;
            reason = "Text direction mismatch suggests scan error";
          }
        }
      } catch (e) { }

      auditResults.push({
        pageNumber: i,
        currentRotation: currentRot,
        suggestedRotation: suggestion,
        confidenceScore: confidence,
        reason
      });
    }
    return auditResults;
  } catch (err) {
    console.error("Analysis Engine Failure:", err);
    return [];
  }
}

export const rotatePDF = async (req: Request, res: Response) => {
  try {
    const targetFile = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
    let { degree, instructions, filter = 'all', ranges, rotateMode } = req.body;
    if (!targetFile) return res.status(400).json({ error: 'Payload missing file' });

    const pdfData = await loadPDFData(targetFile);
    const pdfDoc = await PDFDocument.load(pdfData);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    const appliedFixes: AnalysisResult[] = [];
    const suggestedFixes: AnalysisResult[] = [];
    const warnings: string[] = [];

    // --- Phase 1: Smart Auto-Fix (AI Pattern) ---
    if (rotateMode === 'auto') {
      const audit = await performSmartAnalysis(pdfData);
      audit.forEach(item => {
        if (item.confidenceScore >= 0.85 && item.suggestedRotation !== item.currentRotation) {
          pages[item.pageNumber - 1].setRotation(degrees(item.suggestedRotation));
          appliedFixes.push(item);
        } else if (item.suggestedRotation !== item.currentRotation) {
          suggestedFixes.push(item);
        }
      });
    }

    // --- Phase 2: Manual Instructions ---
    if (instructions) {
      const instList = typeof instructions === 'string' ? JSON.parse(instructions) : instructions;
      instList.forEach((inst: any) => {
        if (inst.index >= 0 && inst.index < totalPages) {
          pages[inst.index].setRotation(degrees(inst.rotation % 360));
        }
      });
    } else if (ranges || degree) {
      const targetIndices = ranges
        ? RangeParser.validateAndParse(ranges, totalPages)
        : pages.map((_, i) => i).filter(i => {
          if (filter === 'odd') return (i + 1) % 2 !== 0;
          if (filter === 'even') return (i + 1) % 2 === 0;
          return true;
        });

      const rotationAngle = parseInt(degree || '90');
      targetIndices.forEach(idx => {
        const page = pages[idx];
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + rotationAngle) % 360));
      });
    }

    const rotatedPdfBytes = await pdfDoc.save({ useObjectStreams: true });
    const safeName = targetFile.originalname.replace(/[^a-z0-9.]/gi, '_').replace(/\.pdf$/i, '') + '_rotated.pdf';
    const uploadResult = await uploadToCloudinary(Buffer.from(rotatedPdfBytes), safeName);

    await saveMetadata({
      originalName: targetFile.originalname,
      cloudinaryId: uploadResult.public_id,
      url: uploadResult.secure_url,
      type: 'pdf',
      size: uploadResult.bytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const response: ProcessOutput = {
      success: true,
      originalPages: totalPages,
      processedPages: totalPages,
      appliedFixes,
      suggestedFixes,
      warnings,
      outputFileName: safeName,
      downloadUrl: uploadResult.secure_url
    };

    res.json(response);
  } catch (error: any) {
    console.error('Rotation Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const analyzeRotation = async (req: Request, res: Response) => {
  try {
    const file = req.file as Express.Multer.File;
    if (!file) return res.status(400).json({ error: 'File required' });

    const pdfData = await loadPDFData(file);
    const audit = await performSmartAnalysis(pdfData);

    res.json({
      success: true,
      audit,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deletePages = async (req: Request, res: Response) => {
  try {
    const targetFile = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
    const { pagesToDelete } = req.body;
    if (!targetFile || !pagesToDelete) return res.status(400).json({ error: 'Input required' });

    const pdfData = await loadPDFData(targetFile);
    const pdfDoc = await PDFDocument.load(pdfData);
    const totalPages = pdfDoc.getPageCount();

    const indicesToRemove = RangeParser.validateAndParse(pagesToDelete, totalPages);

    // Safety check: Prevent deleting all pages
    if (indicesToRemove.length >= totalPages) {
      return res.status(400).json({
        success: false,
        error: "You must keep at least one page in the document."
      });
    }

    // Process in reverse to maintain index stability
    indicesToRemove.sort((a, b) => b - a).forEach(idx => {
      pdfDoc.removePage(idx);
    });

    const modifiedPdfBytes = await pdfDoc.save();
    const safeName = targetFile.originalname.replace(/[^a-z0-9.]/gi, '_').replace(/\.pdf$/i, '') + '_modified.pdf';
    const uploadResult = await uploadToCloudinary(Buffer.from(modifiedPdfBytes), safeName);

    res.json({
      success: true,
      originalPages: totalPages,
      deletedPages: indicesToRemove.map(i => i + 1).sort((a, b) => a - b),
      remainingPages: pdfDoc.getPageCount(),
      outputFileName: safeName,
      downloadUrl: uploadResult.secure_url
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const addWatermark = async (req: Request, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[]) || [];
    const targetFile = files.find(f => f.fieldname === 'pdfFile') || (req.file) || files[0];
    const watermarkImageFile = files.find(f => f.fieldname === 'watermarkImage');

    const {
      type = 'text',
      text = 'WATERMARK',
      opacity = 0.3,
      fontSize = 48,
      rotate = 0,
      font = 'Helvetica',
      bold = 'false',
      italic = 'false',
      color = '#000000',
      gravity = 'center',
      xOffset = 0,
      yOffset = 0,
      ranges = 'all',
      layering = 'over',
      scale = 0.3,
      placementMode = 'preset'
    } = req.body;

    if (!targetFile) return res.status(400).json({ error: 'Source PDF file is required' });

    const pdfData = await loadPDFData(targetFile);
    const pdfDoc = await PDFDocument.load(pdfData);
    const pages = pdfDoc.getPages();
    const totalPages = pages.length;

    // Filter pages by range
    let targetPageIndices: number[] = [];
    if (ranges === 'all') {
      targetPageIndices = pages.map((_, i) => i);
    } else if (ranges === 'first') {
      targetPageIndices = [0];
    } else if (ranges === 'last') {
      targetPageIndices = [totalPages - 1];
    } else {
      targetPageIndices = RangeParser.validateAndParse(ranges, totalPages);
    }

    // Prepare font
    let selectedFont: any;
    if (font === 'Courier') selectedFont = await pdfDoc.embedFont(StandardFonts.Courier);
    else if (font === 'Times') selectedFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    else selectedFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Prepare image if needed
    let embeddedImage: any;
    if (type === 'image' && watermarkImageFile) {
      const imgBuffer = watermarkImageFile.buffer || (watermarkImageFile.path ? await fs.promises.readFile(watermarkImageFile.path) : null);
      if (imgBuffer) {
        if (watermarkImageFile.mimetype === 'image/png') embeddedImage = await pdfDoc.embedPng(imgBuffer);
        else embeddedImage = await pdfDoc.embedJpg(imgBuffer);
      }
    }

    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return rgb(r, g, b);
    };

    const calculateFinalXY = (idx: number, width: number, height: number, wmWidth: number, wmHeight: number) => {
      const margin = 20;
      let x = 0;
      let y = 0;

      // Handle Manual (Tap-to-Sticker) vs Preset
      const isManual = (placementMode === 'manual' || (gravity === 'northwest' && (Number(xOffset) !== 0 || Number(yOffset) !== 0)));

      if (isManual) {
        // EXACT WYSIWYG COORDINATES FROM FRONTEND
        x = Number(xOffset) - (wmWidth / 2);
        y = Number(yOffset) - (wmHeight / 2);

        console.log(`[WATERMARK MANUAL DBG] Page: ${width}x${height}, Click: (${xOffset}, ${yOffset}), Final Drawn: (${x}, ${y}), wmSize: ${wmWidth}x${wmHeight}`);
      } else {
        // Preset Placement Logic (9-Grid)
        switch (gravity) {
          case 'northwest': case 'top-left': x = margin; y = height - wmHeight - margin; break;
          case 'north': case 'top-center': x = (width / 2) - (wmWidth / 2); y = height - wmHeight - margin; break;
          case 'northeast': case 'top-right': x = width - wmWidth - margin; y = height - wmHeight - margin; break;
          case 'center': x = (width / 2) - (wmWidth / 2); y = (height / 2) - (wmHeight / 2); break;
          case 'southwest': case 'bottom-left': x = margin; y = margin; break;
          case 'south': case 'bottom-center': x = (width / 2) - (wmWidth / 2); y = margin; break;
          case 'southeast': case 'bottom-right': x = width - wmWidth - margin; y = margin; break;
          case 'west': x = margin; y = (height / 2) - (wmHeight / 2); break;
          case 'east': x = width - wmWidth - margin; y = (height / 2) - (wmHeight / 2); break;
          default: x = (width / 2) - (wmWidth / 2); y = (height / 2) - (wmHeight / 2);
        }
      }
      return { x, y };
    };

    // ================================================================
    // UNIFIED WATERMARK DRAWING ENGINE
    // Under = 15% opacity (subtle background feel)
    // Over  = user-defined opacity (security overlay)
    // ================================================================
    targetPageIndices.forEach(idx => {
      const page = pages[idx];
      const { width, height } = page.getSize();
      const dynamicFontSize = Number(fontSize) || (width * 0.025);
      let wmWidth = 0, wmHeight = 0;

      if (type === 'text') {
        wmWidth = selectedFont.widthOfTextAtSize(text, dynamicFontSize);
        wmHeight = dynamicFontSize;
      } else if (embeddedImage) {
        const dims = embeddedImage.scale(Number(scale) || 0.3);
        wmWidth = dims.width; wmHeight = dims.height;
      }

      const { x, y } = calculateFinalXY(idx, width, height, wmWidth, wmHeight);

      // Under = professional 15% opacity for subtle branding
      // Over  = user controls opacity for security
      const finalOpacity = (layering === 'under') ? 0.15 : parseFloat(opacity);

      // Fix Rotation Origin & Angle Direction
      // CSS rotates clockwise around bounding box CENTER. 
      // pdf-lib rotates counter-clockwise around BOTTOM-LEFT.
      const angleCSS = parseInt(rotate) || 0;
      const anglePDF = -angleCSS; // Invert to match CSS
      const rads = (anglePDF * Math.PI) / 180;

      // `x` and `y` from calculateFinalXY represent the un-rotated bottom-left.
      // We reverse-engineer the intended Center Point (which is what WYSIWYG users care about)
      const centerX = x + (wmWidth / 2);
      const centerY = y + (wmHeight / 2);

      // We calculate the NEW shifted bottom-left needed by pdf-lib 
      // so that after rotating, the center lands exactly on (centerX, centerY).
      // Basic 2D Rotation Matrix logic:
      const shiftedX = centerX - ((wmWidth / 2) * Math.cos(rads) - (wmHeight / 2) * Math.sin(rads));
      const shiftedY = centerY - ((wmWidth / 2) * Math.sin(rads) + (wmHeight / 2) * Math.cos(rads));

      if (type === 'text') {
        page.drawText(text, {
          x: shiftedX,
          y: shiftedY,
          size: dynamicFontSize,
          font: selectedFont,
          color: hexToRgb(color),
          opacity: finalOpacity,
          rotate: degrees(anglePDF)
        });
      } else if (embeddedImage) {
        page.drawImage(embeddedImage, {
          x: shiftedX,
          y: shiftedY,
          width: wmWidth,
          height: wmHeight,
          opacity: finalOpacity,
          rotate: degrees(anglePDF)
        });
      }
    });

    const watermarkedPdfBytes = await pdfDoc.save();
    const safeOutputName = targetFile.originalname.replace('.pdf', '') + '_watermarked.pdf';
    const uploadResult = await uploadToCloudinary(Buffer.from(watermarkedPdfBytes), safeOutputName);
    await saveMetadata({
      originalName: targetFile.originalname, cloudinaryId: uploadResult.public_id,
      url: uploadResult.secure_url, type: 'pdf', size: uploadResult.bytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    });
    res.json({ success: true, message: 'Watermark added successfully', downloadUrl: uploadResult.secure_url, cloudinaryId: uploadResult.public_id });
  } catch (error: any) {
    console.error('PDF Watermark error', error);
    res.status(500).json({ error: error.message });
  }
};


export const addSignature = async (req: Request, res: Response) => {
  try {
    const targetFile = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
    const { signatureData, x = 50, y = 50, width = 150, height = 50, pageIndex = 0 } = req.body;
    if (!targetFile || !signatureData) return res.status(400).json({ error: 'File and signature data are required' });

    const pdfData = await loadPDFData(targetFile);
    const pdfDoc = await PDFDocument.load(pdfData);
    const pages = pdfDoc.getPages();

    if (pageIndex < 0 || pageIndex >= pages.length) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    const page = pages[pageIndex];
    const posX = Number(x) || 50;
    const posY = Number(y) || 50;
    const sigWidth = Number(width) || 150;
    const sigHeight = Number(height) || 50;

    // Embed the signature image (expecting base64 PNG)
    const signatureImage = await pdfDoc.embedPng(signatureData);
    const sigDims = signatureImage.scaleToFit(sigWidth, sigHeight);

    page.drawImage(signatureImage, {
      x: posX,
      y: page.getHeight() - posY - sigDims.height,
      width: sigDims.width,
      height: sigDims.height,
    });

    const signedPdfBytes = await pdfDoc.save();
    const uploadResult = await uploadToCloudinary(Buffer.from(signedPdfBytes), 'signed.pdf');

    res.json({ message: 'Success', downloadUrl: uploadResult.secure_url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const pdfToWord = async (req: Request, res: Response) => {
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB Limit

  // Paths for temp files — declared outside try so cleanup can always reach them
  let inputPath = '';
  let outputPath = '';
  let profilePath = '';

  try {
    const file = req.file as Express.Multer.File;
    if (!file) return res.status(400).json({ success: false, error: 'Target file missing from payload.' });

    // 1. Validation (Size & MIME)
    if (file.size > MAX_SIZE) return res.status(400).json({ success: false, error: 'File exceeds 10MB SaaS limit.' });
    if (file.mimetype !== 'application/pdf') return res.status(400).json({ success: false, error: 'Invalid format. Expected PDF.' });

    const pdfData = await loadPDFData(file);

    // 2. Security Check (Password / Corruption)
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfData);
    } catch (e: any) {
      if (e.message.includes('encrypted') || e.message.includes('password')) {
        return res.status(400).json({ success: false, error: 'Cannot process password-protected PDFs.' });
      }
      return res.status(400).json({ success: false, error: 'Corrupted or invalid PDF file.' });
    }

    const totalPages = pdfDoc.getPageCount();
    console.log(`🚀 [PDF→Word] Starting conversion: ${file.originalname} (${totalPages} pages)`);

    // ─── STRATEGY 1: Gotenberg (if running) ────────────────────────────────
    try {
      const formData = new FormData();
      // IMPORTANT: send with .pdf extension — Gotenberg detects format by filename
      formData.append('files', fs.createReadStream(file.path), {
        filename: file.originalname.endsWith('.pdf') ? file.originalname : file.originalname + '.pdf',
        contentType: 'application/pdf',
      });

      const response = await axios.post(`${GOTENBERG_URL}/forms/libreoffice/convert`, formData, {
        headers: { ...formData.getHeaders() },
        responseType: 'arraybuffer',
        timeout: 90000, // 90s for large files
      });

      const docxBuffer = Buffer.from(response.data);

      // Validate: Gotenberg should never return an empty buffer
      if (!docxBuffer || docxBuffer.length < 100) {
        throw new Error(`Gotenberg returned empty/invalid response (${docxBuffer?.length ?? 0} bytes)`);
      }

      console.log(`✅ [Gotenberg] Conversion success — ${docxBuffer.length} bytes`);

      const safeOutputName = file.originalname.replace(/\.pdf$/i, '') + '.docx';
      const uploadResult = await uploadToCloudinary(docxBuffer, safeOutputName, 'docx');

      await saveMetadata({
        originalName: file.originalname,
        cloudinaryId: uploadResult.public_id,
        url: uploadResult.secure_url,
        type: 'docx',
        size: uploadResult.bytes,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      return res.json({
        success: true,
        message: 'Conversion completed successfully.',
        downloadUrl: uploadResult.secure_url,
        stats: { pages: totalPages, size: uploadResult.bytes }
      });
    } catch (gotenbergErr: any) {
      console.warn(`⚠️  [Gotenberg] Failed (${gotenbergErr.message}). Falling back to direct LibreOffice...`);
    }

    // ─── STRATEGY 2: Direct LibreOffice exec (Linux server fallback) ───────
    // Ensure temp directory exists
    await fs.promises.mkdir(LIBREOFFICE_TEMP_DIR, { recursive: true });

    // Write PDF to a unique temp file inside the known temp dir
    const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const safePdfName = `input_${uniqueId}.pdf`;
    inputPath = path.join(LIBREOFFICE_TEMP_DIR, safePdfName);
    await fs.promises.writeFile(inputPath, pdfData);

    // LibreOffice saves output in --outdir with the same base name, .docx extension
    const baseName = path.basename(safePdfName, '.pdf');
    outputPath = path.join(LIBREOFFICE_TEMP_DIR, `${baseName}.docx`);
    profilePath = path.join(LIBREOFFICE_TEMP_DIR, `lo_profile_${uniqueId}`);

    // Build the libreoffice command — proper quoting for paths with spaces
    const loCommand = `libreoffice -env:UserInstallation=file://${profilePath} --headless --nologo --norestore --convert-to docx:"Microsoft Word 2007-2019 XML" --outdir "${LIBREOFFICE_TEMP_DIR}" "${inputPath}"`;

    console.log(`▶️  [LibreOffice] Running: ${loCommand}`);

    // AWAIT the exec — this is the critical fix.
    // Without await the file doesn't exist yet when we try to read it.
    const { stdout, stderr } = await execAsync(loCommand, { timeout: 120000 }); // 2 min max
    console.log(`[LibreOffice stdout] ${stdout}`);
    if (stderr) console.warn(`[LibreOffice stderr] ${stderr}`);

    // Verify output file actually exists and is non-empty
    let outputStat: fs.Stats;
    try {
      outputStat = await fs.promises.stat(outputPath);
    } catch {
      throw new Error(`LibreOffice did not produce output at expected path: ${outputPath}`);
    }

    if (outputStat.size < 100) {
      throw new Error(`LibreOffice produced an empty/corrupt file (${outputStat.size} bytes) at: ${outputPath}`);
    }

    console.log(`✅ [LibreOffice] Output ready — ${outputStat.size} bytes at ${outputPath}`);

    // Read the converted file into a buffer
    const docxBuffer = await fs.promises.readFile(outputPath);

    const safeOutputName = file.originalname.replace(/\.pdf$/i, '') + '.docx';
    const uploadResult = await uploadToCloudinary(docxBuffer, safeOutputName, 'docx');

    await saveMetadata({
      originalName: file.originalname,
      cloudinaryId: uploadResult.public_id,
      url: uploadResult.secure_url,
      type: 'docx',
      size: uploadResult.bytes,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // Send response FIRST, then clean up — ensures files are never deleted mid-send
    res.json({
      success: true,
      message: 'Conversion completed successfully.',
      downloadUrl: uploadResult.secure_url,
      stats: { pages: totalPages, size: uploadResult.bytes }
    });

  } catch (error: any) {
    console.error('❌ [pdfToWord] Critical failure:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  } finally {
    // ─── CLEANUP: runs after response is fully sent ─────────────────────
    // Using setImmediate pushes cleanup to the next event loop tick,
    // guaranteeing the response has been dispatched first.
    // Running cleanup via setImmediate
    setImmediate(async () => {
      const pathsToClean = [inputPath, outputPath, profilePath].filter(Boolean);
      for (const p of pathsToClean) {
        try {
          const stat = await fs.promises.stat(p).catch(() => null);
          if (stat) {
            if (stat.isDirectory()) {
              await fs.promises.rm(p, { recursive: true, force: true });
            } else {
              await fs.promises.unlink(p);
            }
          }
          console.log(`🗑️  [Cleanup] Deleted: ${p}`);
        } catch {
          // File may already not exist — silently ignore
        }
      }
    });
  }
};

export const wordToPdf = async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Source file is required.' });

    console.log(`🚀 [Micro-Tool] High-Performance Word to PDF: ${file.originalname}`);

    const fileStream = fs.createReadStream(file.path);
    const formData = new FormData();
    formData.append('files', fileStream, file.originalname);

    try {
      const response = await axios.post(`${GOTENBERG_URL}/forms/libreoffice/convert`, formData, {
        headers: { ...formData.getHeaders() },
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const pdfBytes = Buffer.from(response.data);
      const uploadResult = await uploadToCloudinary(pdfBytes, 'converted.pdf', 'pdf');

      const metadata = await saveMetadata({
        originalName: 'converted.pdf',
        cloudinaryId: uploadResult.public_id,
        url: uploadResult.secure_url,
        type: 'pdf',
        size: uploadResult.bytes,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });

      res.json({ success: true, message: 'Success', downloadUrl: uploadResult.secure_url, metadata });
    } catch (error: any) {
      console.error('❌ Gotenberg Word-to-Pdf Engine Failure:', error.message);
      res.status(500).json({ success: false, error: 'Remote conversion server error. Please ensure Gotenberg is running.' });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const editPDF = async (req: Request, res: Response) => {
  try {
    const targetFile = req.file || (Array.isArray(req.files) ? req.files[0] : undefined);
    const { operations } = req.body;

    if (!targetFile || !operations) return res.status(400).json({ error: 'File and operations are required' });

    const ops = JSON.parse(operations);
    const pdfData = await loadPDFData(targetFile);
    const pdfDoc = await PDFDocument.load(pdfData);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const hexToRgb = (hex: string) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      return rgb(r, g, b);
    };

    for (const op of ops) {
      try {
        if (op.pageIndex < 0 || op.pageIndex >= pages.length) continue;
        const page = pages[op.pageIndex];
        const { width, height } = page.getSize();

        let parsedColor;
        try {
          const opColor = op.color || op.stroke || '#000000';
          parsedColor = opColor.startsWith('#') ? hexToRgb(opColor) : rgb(0, 0, 0);
        } catch (e) { parsedColor = rgb(0, 0, 0); }

        const safeX = Number(op.x) || 0;
        const safeY = Number(op.y) || 0;
        const safeWidth = Number(op.width) || 0;
        const safeHeight = Number(op.height) || 0;
        const safeSize = Number(op.size) || 12;
        const rotation = degrees(op.angle || 0);

        if (op.type === 'text') {
          page.drawText(op.text || '', {
            x: safeX,
            y: height - safeY - (safeSize * 0.82),
            size: safeSize,
            font: font,
            color: parsedColor,
            rotate: rotation,
          });
        } else if (op.type === 'image' && op.imageData) {
          // ... image drawing logic remains mostly same but could add rotation ...
          // pdf-lib drawImage also supports 'rotate'
          let image;
          try {
            if (op.imageData.includes('image/png')) image = await pdfDoc.embedPng(op.imageData);
            else image = await pdfDoc.embedJpg(op.imageData);
          } catch (e) { console.error('Image embed failed', e); continue; }

          if (image) {
            const dims = image.scale(op.scale || 1);
            page.drawImage(image, {
              x: safeX,
              y: height - safeY - dims.height,
              width: dims.width,
              height: dims.height,
              rotate: rotation,
            });
          }
        } else if (op.type === 'rect') {
          let fillColor;
          try { fillColor = op.fill && op.fill.startsWith('#') ? hexToRgb(op.fill) : rgb(1, 1, 1); } catch { fillColor = rgb(1, 1, 1); }

          page.drawRectangle({
            x: safeX,
            y: height - safeY - safeHeight,
            width: safeWidth,
            height: safeHeight,
            color: fillColor,
            opacity: op.opacity || 1,
            rotate: rotation,
          });
        } else if (op.type === 'draw' && op.pathData && op.pathData.length > 5) {
          page.drawSvgPath(op.pathData, {
            x: 0,
            y: height,
            scale: 1,
            borderColor: parsedColor,
            borderWidth: Number(op.strokeWidth) || 2,
            borderOpacity: op.opacity || 1,
          });
        }
      } catch (opError) {
        console.error('Operation failed:', op.type, opError);
        // Continue to next op instead of crashing
      }
    }

    const modifiedPdfBytes = await pdfDoc.save();

    // Direct Local Save (Bypass Cloudinary)
    const timestamp = Date.now();
    const fileName = `edited-${timestamp}.pdf`;
    // Ensure we point to project root public folder
    const uploadsDir = path.resolve(__dirname, '../../public/uploads');

    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const outputPath = path.join(uploadsDir, fileName);
    await fs.promises.writeFile(outputPath, modifiedPdfBytes);

    // Return direct URL
    // Assuming backend runs on port 5000
    const downloadUrl = `http://localhost:5000/public/uploads/${fileName}`;

    res.json({ message: 'Success', downloadUrl });

  } catch (error: any) {
    console.error('Edit error:', error);
    try {
      const logPath = path.resolve(__dirname, '../../error_log.txt');
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${error.message}\n${error.stack}\n\n`);
    } catch (e) { }
    res.status(500).json({ error: error.message });
  }
};

/**
 * AUTO-CLEANUP ENGINE
 * Immediately removes files from Cloudinary storage after the user downloads them
 */
export const cleanupFile = async (req: Request, res: Response) => {
  try {
    const { cloudinaryId } = req.body;
    if (!cloudinaryId) {
      return res.status(400).json({ success: false, error: 'No cloudinary ID provided for cleanup' });
    }

    console.log(`🧹 Running auto-cleanup for: ${cloudinaryId}`);

    // Remote destruction from Cloudinary (Must specify raw type for PDFs)
    const destructionResult = await cloudinary.uploader.destroy(cloudinaryId, { resource_type: 'raw' });
    console.log(`🧹 Cloudinary destroy response:`, destructionResult);

    // Note: GitHub DB automatically overwrites metadata, no deep DB pruning necessary here.
    return res.json({ success: true, message: 'Source file permanently purged from cloud storage' });
  } catch (error: any) {
    console.error('Auto-Cleanup Error:', error);
    return res.status(500).json({ success: false, error: 'Cleanup failed' });
  }
};
