export interface PipelineMetadata {
  pageCount: number;
  wordCount: number;
  characterCount: number;
  tableCount: number;
  imageCount: number;
  fileSize: number;
  language?: string;
}

export interface PipelinePerformance {
  processing_time_ms: number;
  memory_used_mb: number;
}

export interface PipelineResult<T> {
  success: boolean;
  data?: T;
  file_url?: string;
  metadata?: PipelineMetadata;
  performance: PipelinePerformance;
  hash?: string;
}

export interface ConversionJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: PipelineResult<any>;
  error?: string;
  createdAt: Date;
}
