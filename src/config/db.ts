import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI || process.env.MONGODB_URI.includes('admin:password') || process.env.MONGODB_URI.includes('your_')) {
      console.warn('⚠️  MongoDB URI not configured. Running without database.');
      console.warn('⚠️  File metadata will not be saved. Configure MONGODB_URI in .env to enable database.');
      return;
    }
    const conn = await mongoose.connect(process.env.MONGODB_URI as string);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`⚠️  MongoDB Connection Error: ${(error as Error).message}`);
    console.warn('⚠️  Server will continue without database. File processing will work but metadata won\'t be saved.');
  }
};

export default connectDB;
