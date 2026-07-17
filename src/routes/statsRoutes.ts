import { Router } from 'express';
import { StatsController } from '../controllers/StatsController';
import { auth } from '../middlewares/auth';

const router = Router();
const controller = new StatsController();

router.get('/classement', auth, controller.getClassement);
router.get('/commercial/:commercialId', auth, controller.getStatsCommercial);

export default router;