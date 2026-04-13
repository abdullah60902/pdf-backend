import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import path from 'path';

// Initialize dotenv first
dotenv.config();

import upload from './middleware/multerConfig';
import pdfRoutes from './routes/pdfRoutes';
import imageRoutes from './routes/imageRoutes';
import bgRoutes from './routes/bgRoutes';
import gotenbergRoutes from './routes/gotenbergRoutes';
import { errorHandler } from './middleware/errorHandler';
import { cleanupService } from './services/CleanupService';
import { verifyLibreOffice, getLibreOfficePath } from './utils/libreofficePath';
import { engineConfig } from './config/engineConfig';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📡 [${req.method}] ${req.originalUrl}`);
  next();
});

// Routes
app.use('/api/pdf', pdfRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/bg', bgRoutes);
app.use('/api/gotenberg', gotenbergRoutes);

app.get('/', (req, res) => {
  res.send('PDF Toolkit API is running. Check /health for status.');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'running',
    cloudinary: {
      configured: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key_set: !!process.env.CLOUDINARY_API_KEY,
      api_secret_set: !!process.env.CLOUDINARY_API_SECRET,
    },
    github_db: {
      configured: !!process.env.GITHUB_TOKEN && !!process.env.GITHUB_OWNER && !!process.env.GITHUB_REPO,
      repo: `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
      branch: process.env.GITHUB_BRANCH || 'main'
    },
    gotenberg: {
      enabled: true,
      unlimited: true,
      url: engineConfig.gotenbergUrl
    },
    libreoffice: {
      available: verifyLibreOffice(),
      path: getLibreOfficePath()
    }
  });
});

// Global Error Handler
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log('☁️ Cloudinary Configuration:');
  console.log(`- Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`- API Key: ${process.env.CLOUDINARY_API_KEY?.substring(0, 6)}...`);
  console.log(`- API Secret Length: ${process.env.CLOUDINARY_API_SECRET?.length}`);
  console.log('🌐 Network Proxy Check:');
  console.log(`- HTTP_PROXY: ${process.env.HTTP_PROXY || process.env.http_proxy || 'Not set'}`);
  console.log(`- HTTPS_PROXY: ${process.env.HTTPS_PROXY || process.env.https_proxy || 'Not set'}`);
  console.log(`- NO_PROXY: ${process.env.NO_PROXY || process.env.no_proxy || 'Not set'}`);
});

// Graceful Shutdown
const shutdown = () => {
  console.log('🛑 Shutting down server gracefully...');
  server.close(() => {
    console.log('🏁 Server closed.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
