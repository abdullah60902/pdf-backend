import fs from 'fs';
import path from 'path';
import cloudinary from '../utils/cloudinary';
import { Logger } from '../utils/Logger';

export interface UploadResult {
  public_id: string;
  secure_url: string;
  bytes: number;
  format: string;
}

export class StorageService {
  private logger = new Logger('StorageService');

  async uploadBuffer(buffer: Buffer, originalName: string, format: string = 'pdf'): Promise<UploadResult> {
    try {
      this.logger.info(`Uploading file to Cloudinary: ${originalName}`);

      return new Promise((resolve, reject) => {
        // Clean public_id: remove spaces and special characters that break URLs
        const safeId = originalName
          .replace(/\.[^/.]+$/, "") // remove extension
          .replace(/[^a-zA-Z0-9-]/g, "_") // replace non-alphanumeric with underscore
          .substring(0, 50); // limit length

        let publicId = `${Date.now()}-${safeId}`;
        const isRaw = format === 'docx';
        if (isRaw) {
          publicId = `${publicId}.docx`;
        }

        const uploadOptions: any = {
          folder: 'pdf-toolkit',
          resource_type: isRaw ? 'raw' : 'auto',
          public_id: publicId,
        };
        
        if (!isRaw) {
          uploadOptions.format = format;
        }

        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              this.logger.error('Cloudinary upload failed', error);
              return reject(error);
            }
            if (!result) {
              return reject(new Error('Cloudinary upload result is empty'));
            }

            // For images, we use 'image' resource type explicitly if auto failed or for better signed URLs
            const resType = result.resource_type || (isRaw ? 'raw' : 'auto');

            // Generating a SIGNED URL bypassing the strict delivery 401 error.
            // Using flags: 'attachment' to force browser download.
            const urlOptions: any = {
              secure: true,
              sign_url: true,
              resource_type: resType,
              flags: 'attachment'
            };
            
            if (resType !== 'raw') {
              urlOptions.format = result.format || format;
            }

            const signedSecureUrl = cloudinary.url(result.public_id, urlOptions);

            this.logger.info(`✅ Uploaded to Cloudinary with Signed URL: ${signedSecureUrl}`);
            resolve({
              public_id: result.public_id,
              secure_url: signedSecureUrl || result.secure_url,
              bytes: result.bytes,
              format: result.format || format
            });
          }
        );

        uploadStream.end(buffer);
      });
    } catch (error) {
      this.logger.error('Upload failed', error);
      throw error;
    }
  }

  async deleteFromCloudinary(publicId: string) {
    try {
      this.logger.info(`Deleting from Cloudinary: ${publicId}`);
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      this.logger.error(`Failed to delete ${publicId} from Cloudinary`, error);
    }
  }

  async deleteFile(filePath: string) {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        this.logger.info(`Deleted local file: ${filePath}`);
      }
    } catch (error) {
      this.logger.error('Delete failed', error);
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.promises.readFile(filePath);
  }

  getTempDir(): string {
    const dir = path.join(__dirname, '../../public/temp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
}

export const storageService = new StorageService();
