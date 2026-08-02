import { Router } from 'express';
import { ChargeController } from '../controllers/ChargeController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new ChargeController();

// Routes spécifiques AVANT /:id (sinon Express capture "resume-mensuel" comme un id)
router.get('/resume-mensuel', auth, adminOrManager, controller.getResumeMensuel);

router.get('/', auth, adminOrManager, controller.getAll);
router.get('/:id', auth, adminOrManager, controller.getById);
router.post('/', auth, adminOrManager, controller.create);
router.put('/:id', auth, adminOrManager, controller.update);
router.delete('/:id', auth, adminOrManager, controller.delete);

export default router;