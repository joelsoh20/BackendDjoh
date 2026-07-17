import { Router } from 'express';
import { ChargeController } from '../controllers/ChargeController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new ChargeController();

router.get('/', auth, adminOrManager, controller.getAll);
router.get('/:id', auth, adminOrManager, controller.getById);
router.post('/', auth, adminOrManager, controller.create);
router.put('/:id', auth, adminOrManager, controller.update);
router.delete('/:id', auth, adminOrManager, controller.delete);
//router.get('/resume-mensuel', auth, adminOrManager, controller.getResumeMensuel);
router.get('/resume-mensuel', (req, res) => {
  console.log('ROUTE RESUME MENSUEL TOUCHÉE');
  res.json({ success: true, data: { test: 'ok' } });
});

export default router;