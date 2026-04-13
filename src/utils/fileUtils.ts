import crypto from 'crypto';
import path from 'path';

export const generateFileHash = (buffer: Buffer): string => {
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

export const sanitizeFilename = (filename: string): string => {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  const safeName = name
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
  return `${safeName}${ext}`;
};

export const getFileExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase().substring(1);
};
