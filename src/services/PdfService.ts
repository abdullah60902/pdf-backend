import { PDFDocument } from 'pdf-lib';
import { Document, Packer, Paragraph, TextRun } from 'docx';
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
import { Logger } from '../utils/Logger';
import { PipelineMetadata } from '../types/pipeline';
import { ConversionError } from '../errors/AppError';

export class PdfService {
  private logger = new Logger('PdfService');

  async getMetadata(buffer: Buffer): Promise<PipelineMetadata> {
    try {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;

      let wordCount = 0;
      let characterCount = 0;
      let imageCount = 0;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const opList = await page.getOperatorList();

        // Count images
        imageCount += opList.fnArray.filter((f: any) =>
          f === pdfjs.OPS.paintImageXObject || f === pdfjs.OPS.paintInlineImageXObject
        ).length;

        textContent.items.forEach((item: any) => {
          wordCount += item.str.split(/\s+/).filter(Boolean).length;
          characterCount += item.str.length;
        });
      }

      return {
        pageCount: numPages,
        wordCount,
        characterCount,
        tableCount: 0, // Basic implementation, tables are hard to detect without OCR/advanced layout analysis
        imageCount,
        fileSize: buffer.length,
      };
    } catch (error) {
      this.logger.error('Failed to extract metadata', error);
      throw new ConversionError('Failed to analyze PDF structure');
    }
  }

  async convertToDocx(buffer: Buffer): Promise<Buffer> {
    const { engineConfig } = require('../config/engineConfig');
    const path = require('path');
    const fs = require('fs-extra');
    const axios = require('axios');
    const FormData = require('form-data');

    const tempInput = path.join(engineConfig.tempDir, `input_${Date.now()}.pdf`);

    try {
      await fs.ensureDir(engineConfig.tempDir);
      await fs.writeFile(tempInput, buffer);

      this.logger.info(`🚀 Converting PDF to DOCX using Gotenberg (unlimited)...`);

      // Build FormData for Gotenberg LibreOffice endpoint
      const formData = new FormData();
      formData.append('files', fs.createReadStream(tempInput), {
        filename: 'document.pdf',
        contentType: 'application/pdf',
      });

      // Send to Gotenberg - LibreOffice convert endpoint
      const response = await axios.post(
        `${engineConfig.gotenbergUrl}/forms/libreoffice/convert`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          responseType: 'arraybuffer',
          timeout: engineConfig.timeoutDurationMS,
        }
      );

      await fs.remove(tempInput); // Cleanup input file
      this.logger.info(`✅ PDF to Word conversion successful (Gotenberg)!`);

      return Buffer.from(response.data);
    } catch (error: any) {
      this.logger.error('Gotenberg PDF-to-DOCX conversion failed', error);
      await fs.remove(tempInput).catch(() => { });

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        throw new ConversionError('Gotenberg conversion service is currently unavailable. Please try again later.');
      }

      const errorMsg = error.message || 'Conversion failed';
      throw new ConversionError(`Failed to convert PDF to Word: ${errorMsg}`);
    }
  }

  async isScanned(buffer: Buffer): Promise<boolean> {
    try {
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      return textContent.items.length === 0;
    } catch (error) {
      return false;
    }
  }
}

export const pdfService = new PdfService();
