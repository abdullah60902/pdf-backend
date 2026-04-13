import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../../errors/AppError';

export const validateFileUpload = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file && (!req.files || (req.files as any).length === 0)) {
    throw new ValidationError('No file uploaded');
  }
  next();
};

export const validateFileSize = (maxSizeInBytes: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (file && file.size > maxSizeInBytes) {
      throw new ValidationError(`File too large. Max size is ${maxSizeInBytes / (1024 * 1024)}MB`);
    }
    next();
  };
};

export const validateMimeType = (allowedTypes: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const file = req.file;
    if (file && !allowedTypes.includes(file.mimetype)) {
      throw new ValidationError(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
    }
    next();
  };
};
