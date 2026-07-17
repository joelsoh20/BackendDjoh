import { Router } from 'express';
import { auth } from '../middlewares/auth';
import { NotificationToken } from '../models/NotificationToken';

const router = Router();

router.post('/register', auth, async (req, res) => {
  try {
    const userId = (req as any).utilisateur.id;
    const { token } = req.body;

    await NotificationToken.findOrCreate({
      where: { user_id: userId, token },
      defaults: { user_id: userId, token }
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

export default router;