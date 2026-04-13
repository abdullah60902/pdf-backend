import { Router } from 'express';
import upload from '../middleware/multerConfig';
import { wordToPdfGotenberg } from '../controllers/GotenbergController';

const router = Router();

// Word to PDF via Gotenberg Docker container
router.post('/word-to-pdf', upload.any(), wordToPdfGotenberg);

export default router;
