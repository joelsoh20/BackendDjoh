import { Router } from 'express';
import { StockController } from '../controllers/StockController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new StockController();

router.get('/', auth, adminOrManager, controller.getAll);
router.get('/:productId', auth, adminOrManager, controller.getByProduct);
router.post('/ajouter', auth, adminOrManager, controller.ajouter);

export default router;