import { Router } from 'express';
import upload from '../middleware/multerConfig';
import { removeBackground } from '../controllers/BgRemoverController';

const router = Router();

// Background removal via RemBG Docker container
router.post('/remove', upload.any(), removeBackground);

export default router;
