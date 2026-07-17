import { Router } from 'express';
import { DashboardController } from '../controllers/DashboardController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new DashboardController();

router.get('/', auth, adminOrManager, controller.getDashboard);

export default router;

