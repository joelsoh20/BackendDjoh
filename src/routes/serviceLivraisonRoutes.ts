import { Router } from 'express';
import { ServiceLivraisonController } from '../controllers/ServiceLivraisonController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new ServiceLivraisonController();

router.get('/', auth, adminOrManager, controller.getAll);
router.post('/', auth, adminOrManager, controller.create);
router.patch('/:id/toggle', auth, adminOrManager, controller.toggleActif);
router.post('/stock', auth, adminOrManager, controller.ajouterStock);
router.get('/:serviceId/stocks', auth, adminOrManager, controller.getStocks);

export default router;