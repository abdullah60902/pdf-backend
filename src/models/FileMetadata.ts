import mongoose, { Schema, Document } from 'mongoose';

export interface IFileMetadata extends Document {
  originalName: string;
  cloudinaryId: string;
  url: string;
  type: string;
  size: number;
  expiresAt: Date;
}

const FileMetadataSchema: Schema = new Schema({
  originalName: { type: String, required: true },
  cloudinaryId: { type: String, required: true },
  url: { type: String, required: true },
  type: { type: String, required: true },
  size: { type: Number, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL Index
}, { timestamps: true });

export default mongoose.model<IFileMetadata>('FileMetadata', FileMetadataSchema);
