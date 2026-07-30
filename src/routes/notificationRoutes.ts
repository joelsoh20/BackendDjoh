import { Router } from 'express';
import { NotificationController } from '../controllers/NotificationController';
import { auth } from '../middlewares/auth';
import { adminOrManager } from '../middlewares/role';

const router = Router();
const controller = new NotificationController();

// 🔓 Routes accessibles à tous les utilisateurs authentifiés
router.post('/register', auth, controller.registerToken);
router.delete('/token', auth, controller.removeToken);

// 🔒 Routes réservées aux managers/admins
router.post('/send', auth, adminOrManager, controller.sendToUser);
router.post('/send-group', auth, adminOrManager, controller.sendToGroup);

export default router;