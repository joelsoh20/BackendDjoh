import { Router } from 'express';
import { StockController } from '../controllers/StockController';
import { auth } from '../middlewares/auth';
import { adminOrManager, adminOnly } from '../middlewares/role';

const router = Router();
const controller = new StockController();

router.get('/', auth, adminOrManager, controller.getAll);
router.get('/:productId/mouvements', auth, adminOrManager, controller.getMouvements);
router.get('/:productId', auth, adminOrManager, controller.getByProduct);
// Ajout au stock général réservé à l'admin — le manager ne doit plus
// pouvoir approvisionner ce stock (décision produit).
router.post('/ajouter', auth, adminOnly, controller.ajouter);
router.patch('/mouvements/:id', auth, adminOrManager, controller.modifierMouvement);

export default router;