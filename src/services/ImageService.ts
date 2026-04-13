import sharp from 'sharp';
import path from 'path';
import fs from 'fs-extra';
// @ts-ignore
import potrace from 'potrace';
import { Logger } from '../utils/Logger';
import { engineConfig } from '../config/engineConfig';

export class ImageService {
  private logger = new Logger('ImageService');

  async convertImage(inputBuffer: Buffer, format: string, options: any = {}): Promise<Buffer> {
    try {
      this.logger.info(`Converting image to ${format}...`);

      if (format.toLowerCase() === 'svg') {
        return await this.convertToSvg(inputBuffer, options);
      }

      let transform = sharp(inputBuffer);

      // Apply resizing if provided
      if (options.width || options.height) {
        transform = transform.resize(Number(options.width) || undefined, Number(options.height) || undefined, {
          fit: options.fit || 'cover',
          withoutEnlargement: true
        });
      }

      // Apply advanced operations
      if (options.grayscale) transform = transform.grayscale();
      if (options.negate) transform = transform.negate();
      if (options.flip) transform = transform.flip();
      if (options.flop) transform = transform.flop();
      if (options.rotate) transform = transform.rotate(Number(options.rotate));
      if (options.blur) transform = transform.blur(Number(options.blur));
      if (options.sharpen) transform = transform.sharpen();

      if (options.quality) {
        transform = transform.toFormat(format as any, { quality: Number(options.quality) });
      } else {
        transform = transform.toFormat(format as any);
      }

      return await transform.toBuffer();
    } catch (error: any) {
      this.logger.error(`Image conversion failed: ${error.message}`);
      throw new Error(`Failed to convert image: ${error.message}`);
    }
  }

  async convertToSvg(inputBuffer: Buffer, options: any = {}): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.logger.info('Tracing image to SVG (Vectorization)...');

      // We first use sharp to simplify the image for better tracing if it's large/complex
      sharp(inputBuffer)
        .grayscale()
        .toBuffer()
        .then(grayscaleBuffer => {
          potrace.trace(grayscaleBuffer, {
            threshold: options.threshold || 128,
            turdSize: 2,
            optTolerance: 0.2
          }, (err: any, svg: string) => {
            if (err) return reject(err);
            resolve(Buffer.from(svg));
          });
        })
        .catch(reject);
    });
  }

  async applyWatermark(inputBuffer: Buffer, options: any): Promise<Buffer> {
    try {
      this.logger.info(`Applying watermark... Type: ${options.type}`);
      const main = sharp(inputBuffer);
      const metadata = await main.metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      let watermark: any;

      if (options.type === 'text' && options.text) {
        // Create SVG overlay for text
        // Note: To handle rotation properly in text, we rotate the individual SVG element 
        // or let sharp rotate the whole overlay buffer.
        const color = options.color || '#ffffff';
        const opacity = options.opacity !== undefined ? Number(options.opacity) : 0.5;
        const fontSize = options.fontSize ? Number(options.fontSize) : 52;
        const rotate = options.rotate ? Number(options.rotate) : 0;
        const font = options.font || 'Arial';

        const svg = `
          <svg width="${width}" height="${height}">
            <defs>
              <pattern id="tile" width="${fontSize * 4}" height="${fontSize * 4}" patternUnits="userSpaceOnUse">
                 <text 
                  x="${fontSize}" y="${fontSize}" 
                  fill="${color}" 
                  font-size="${fontSize}" 
                  font-family="${font}, sans-serif" 
                  font-weight="900" 
                  opacity="${opacity}" 
                  transform="rotate(${rotate}, ${fontSize}, ${fontSize})" 
                  text-anchor="middle"
                >${options.text}</text>
              </pattern>
            </defs>
            ${options.tile
            ? `<rect width="100%" height="100%" fill="url(#tile)" />`
            : `<text 
                  x="50%" y="50%" 
                  fill="${color}" 
                  font-size="${fontSize}" 
                  font-family="${font}, sans-serif" 
                  font-weight="900" 
                  opacity="${opacity}" 
                  transform="rotate(${rotate}, ${width / 2}, ${height / 2})" 
                  text-anchor="middle" 
                  dominant-baseline="middle"
                >${options.text}</text>`
          }
          </svg>
        `;
        watermark = { input: Buffer.from(svg), gravity: options.gravity || 'center' };
      } else if (options.type === 'image' && options.watermarkImage) {
        let wm = sharp(options.watermarkImage);

        // Resize watermark to be proportionate (e.g. 20% of main image width)
        wm = wm.resize({ width: Math.round(width * 0.25), withoutEnlargement: true });

        if (options.opacity !== undefined) {
          wm = wm.ensureAlpha(Number(options.opacity));
        }

        if (options.rotate) {
          wm = wm.rotate(Number(options.rotate), { background: { r: 0, g: 0, b: 0, alpha: 0 } });
        }

        const wmBuffer = await wm.toBuffer();
        watermark = {
          input: wmBuffer,
          gravity: options.gravity || 'center',
          tile: options.tile || false
        };
      }

      if (!watermark) return inputBuffer;

      return await main.composite([watermark]).toBuffer();
    } catch (error: any) {
      this.logger.error(`Watermarking failed: ${error.message}`);
      throw new Error(`Failed to apply watermark: ${error.message}`);
    }
  }

  async getMetadata(buffer: Buffer) {
    try {
      return await sharp(buffer).metadata();
    } catch (error: any) {
      this.logger.error(`Failed to get image metadata: ${error.message}`);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }
}

export const imageService = new ImageService();
