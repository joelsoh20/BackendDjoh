import { Router } from 'express';
import { OrderCommentController } from '../controllers/OrderCommentController';
import { auth } from '../middlewares/auth';

const router = Router();
const ctrl = new OrderCommentController();

router.get('/:orderId', auth, ctrl.getByOrder);
router.post('/', auth, ctrl.add);

export default router;