import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { Commande } from '../../models/Commande';
import { CommandeLigne } from '../../models/CommandeLigne';
import { StockLivraison } from '../../models/StockLivraison';
import { Database } from '../../config/database';
import { verifierStockService, formaterMessageManquants } from '../../utils/verifierStockService';

export class OrderLivraisonController extends OrderController {

  // Assigner un service de livraison à une commande (tous ses produits)
  assignerServiceLivraison = async (req: Request, res: Response): Promise<void> => {
    const sequelize = Database.getInstance();
    const transaction = await sequelize.transaction();
    try {
      const { orderId, serviceLivraisonId } = req.body;
      const userRole = (req as any).utilisateur.role;

      if (userRole !== 'manager' && userRole !== 'admin') {
        await transaction.rollback();
        return this.forbidden(res, 'Seul un manager ou admin peut assigner un service de livraison');
      }

      const commande = await Commande.findByPk(orderId, {
        include: [{ model: CommandeLigne, as: 'lignes' }],
        transaction
      });
      if (!commande) {
        await transaction.rollback();
        return this.notFound(res, 'Commande non trouvée');
      }

      const lignes = (commande as any).lignes as CommandeLigne[];

      // Vérifie TOUTES les lignes d'un coup et remonte la liste complète
      // des manques (au lieu de s'arrêter au premier produit en rupture).
      const { ok, manquants } = await verifierStockService(
        serviceLivraisonId,
        lignes.map(l => ({ product_id: l.product_id, quantite: l.quantite }))
      );
      if (!ok) {
        await transaction.rollback();
        res.status(400).json({
          success: false,
          message: formaterMessageManquants(manquants),
          manquants,
        });
        return;
      }

      commande.service_livraison_id = serviceLivraisonId;
      await commande.save({ transaction });

      for (const ligne of lignes) {
        await StockLivraison.decrement(
          { quantite: ligne.quantite },
          { where: { service_id: serviceLivraisonId, product_id: ligne.product_id }, transaction }
        );
      }

      await transaction.commit();
      this.success(res, commande, '✅ Service de livraison assigné avec succès');
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Erreur assignation:', error);
      this.error(res, 'Erreur lors de l\'assignation');
    }
  };
}
