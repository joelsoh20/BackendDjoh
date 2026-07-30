import { Router } from 'express';
import authRoutes from './authRoutes';
import userRoutes from './userRoutes';
import productRoutes from './productRoutes';
import orderRoutes from './orderRoutes';
import chargeRoutes from './chargeRoutes';
import dashboardRoutes from './dashboardRoutes';
import closingRoutes from './closingRoutes';
import exportRoutes from './exportRoutes';
import stockRoutes from './stockRoutes';
import serviceLivraisonRoutes from './serviceLivraisonRoutes';
import statsRoutes from './statsRoutes';
import orderCommentRoutes from './orderCommentRoutes'; 
import notificationRoutes from './notificationRoutes';


const router = Router();

router.use('/auth', authRoutes);
router.use('/utilisateurs', userRoutes);
router.use('/produits', productRoutes);
router.use('/commandes', orderRoutes);
router.use('/charges', chargeRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/clotures', closingRoutes);
router.use('/exports', exportRoutes);
router.use('/stocks', stockRoutes);
router.use('/services-livraison', serviceLivraisonRoutes);
router.use('/stats', statsRoutes);
router.use('/order-comments', orderCommentRoutes); 
router.use('/notifications', notificationRoutes);

export default router;