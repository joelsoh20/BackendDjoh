import { Router } from 'express';
import { OrderController } from '../controllers/order/OrderController';
import { OrderStatutController } from '../controllers/order/OrderStatutController';
import { OrderDashboardController } from '../controllers/order/OrderDashboardController';
import { OrderLivraisonController } from '../controllers/order/OrderLivraisonController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const orderCtrl = new OrderController();
const statutCtrl = new OrderStatutController();
const dashboardCtrl = new OrderDashboardController();
const livraisonCtrl = new OrderLivraisonController();

// Routes spécifiques AVANT /:id
router.get('/mes-commandes', auth, orderCtrl.getMesCommandes);
router.get('/mon-dashboard', auth, dashboardCtrl.getMonDashboard);
router.patch('/:id/statut', auth, adminOrManager, statutCtrl.updateStatut);
router.put('/:id', auth, orderCtrl.updateOrder);
router.delete('/:id', auth, orderCtrl.deleteOrder);
router.patch('/assigner-service', auth, adminOrManager, livraisonCtrl.assignerServiceLivraison);

// Routes générales
router.get('/', auth, orderCtrl.getAll);
router.get('/:id', auth, orderCtrl.getById);
router.post('/', auth, orderCtrl.create);

export default router;