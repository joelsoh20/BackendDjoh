import { Router } from 'express';
import { ExportController } from '../controllers/ExportController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new ExportController();

router.get('/fec', auth, adminOrManager, controller.exportFEC);
router.get('/pdf', auth, adminOrManager, controller.exportPDF);
router.get('/balance', auth, adminOrManager, controller.exportBalance);

export default router;