import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';
import { auth } from '../middlewares/auth';

const router = Router();
const controller = new AuthController();

router.post('/login', controller.login);
router.get('/me', auth, controller.getProfile);
router.put('/changer-mot-de-passe', auth, controller.changerMotDePasse);

export default router;