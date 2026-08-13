import { Router } from 'express';
import { UserController } from '../controllers/UserController';
import { auth } from '../middlewares/auth';
import { adminOnly, adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new UserController();

router.get('/', auth, adminOrManager, controller.getAll);
router.get('/:id', auth, adminOrManager, controller.getById);
router.post('/', auth, adminOnly, controller.create);
router.put('/:id', auth, adminOnly, controller.update);
router.patch('/:id/toggle-actif', auth, adminOnly, controller.toggleActif);
router.patch('/:id/mot-de-passe', auth, adminOnly, controller.changerMotDePasse);
router.post('/:userId/commissions-produits', auth, adminOnly, controller.addCommissionProduit);
router.delete('/:userId/commissions-produits/:productId', auth, adminOnly, controller.removeCommissionProduit);
router.post('/:userId/bonus-paliers', auth, adminOnly, controller.addBonusPalier);
router.delete('/:userId/bonus-paliers/:palierId', auth, adminOnly, controller.removeBonusPalier);

export default router;