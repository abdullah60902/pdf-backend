export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONVERSION_ERROR = 'CONVERSION_ERROR',
  OCR_FAILURE = 'OCR_FAILURE',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  LIBREOFFICE_CRASH = 'LIBREOFFICE_CRASH',
  CORRUPTED_FILE = 'CORRUPTED_FILE',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
}

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errorCode: ErrorCode = ErrorCode.INTERNAL_SERVER_ERROR,
    public details: any = null
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      success: false,
      error_code: this.errorCode,
      message: this.message,
      details: this.details,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: any = null) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
  }
}

export class ConversionError extends AppError {
  constructor(message: string, details: any = null) {
    super(message, 500, ErrorCode.CONVERSION_ERROR, details);
  }
}

export class TimeoutError extends AppError {
  constructor(message: string) {
    super(message, 408, ErrorCode.TIMEOUT_ERROR);
  }
}

export class MemoryLimitError extends AppError {
  constructor(message: string) {
    super(message, 507, ErrorCode.MEMORY_LIMIT_EXCEEDED);
  }
}

export class UnsupportedFileError extends AppError {
  constructor(message: string) {
    super(message, 415, ErrorCode.UNSUPPORTED_FILE_TYPE);
  }
}

export class LibreOfficeCrashError extends AppError {
  constructor(message: string, details: any = null) {
    super(message, 500, ErrorCode.LIBREOFFICE_CRASH, details);
  }
}

export class CorruptedFileError extends AppError {
  constructor(message: string) {
    super(message, 400, ErrorCode.CORRUPTED_FILE);
  }
}

export class UnsupportedFormatError extends AppError {
  constructor(message: string) {
    super(message, 400, ErrorCode.UNSUPPORTED_FORMAT);
  }
}
