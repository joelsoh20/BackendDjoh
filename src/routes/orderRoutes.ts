import { Router } from 'express';
import { OrderController } from '../controllers/OrderController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new OrderController();

// Routes spécifiques AVANT /:id
router.get('/mes-commandes', auth, controller.getMesCommandes);
router.get('/mon-dashboard', auth, controller.getMonDashboard);
router.patch('/:id/statut', auth, adminOrManager, controller.updateStatut);
router.put('/:id', auth, controller.updateOrder);
router.delete('/:id', auth, controller.deleteOrder);

// Routes générales
router.get('/', auth, controller.getAll);
router.get('/:id', auth, controller.getById);
router.post('/', auth, controller.create);
export default router;