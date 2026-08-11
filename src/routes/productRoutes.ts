import { Router } from 'express';
import { ProductController } from '../controllers/ProductController';
import { auth } from '../middlewares/auth';
import { adminOrManager, adminOnly } from '../middlewares/role';

const router = Router();
const controller = new ProductController();

router.get('/', auth, controller.getAll);
router.get('/:id', auth, controller.getById);
router.post('/', auth, adminOrManager, controller.create);
router.put('/:id', auth, adminOrManager, controller.update);
router.patch('/:id/toggle-actif', auth, adminOrManager, controller.toggleActif);
router.delete('/:id', auth, adminOnly, controller.delete);

export default router;