import { Router } from 'express';
import { ClosingController } from '../controllers/ClosingController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new ClosingController();

router.get('/', auth, adminOrManager, controller.getAll);
router.post('/', auth, adminOrManager, controller.cloturer);

export default router;