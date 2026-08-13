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

      // Verrou de ligne : sérialise les requêtes concurrentes sur la même
      // commande (double-tap, retry réseau) pour que les gardes
      // d'idempotence ci-dessous restent fiables même en cas d'appels
      // simultanés.
      const commande = await Commande.findByPk(orderId, {
        include: [{ model: CommandeLigne, as: 'lignes' }],
        transaction,
        lock: { level: transaction.LOCK.UPDATE, of: Commande }
      });
      if (!commande) {
        await transaction.rollback();
        return this.notFound(res, 'Commande non trouvée');
      }

      const lignes = (commande as any).lignes as CommandeLigne[];
      const ancienServiceId = commande.service_livraison_id;

      // Idempotence : le service demandé est déjà celui assigné, on ne
      // rejoue pas la décrémentation (un double appel ne doit pas
      // décrémenter deux fois le même stock).
      if (ancienServiceId === serviceLivraisonId) {
        await transaction.commit();
        this.success(res, commande, 'Service de livraison déjà assigné (aucune modification)');
        return;
      }

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

      // Si un autre service était déjà assigné (réassignation), on lui
      // restitue son stock avant de décrémenter le nouveau — sinon le
      // stock de l'ancien service reste bloqué indéfiniment.
      if (ancienServiceId) {
        for (const ligne of lignes) {
          await StockLivraison.increment(
            { quantite: ligne.quantite },
            { where: { service_id: ancienServiceId, product_id: ligne.product_id }, transaction }
          );
        }
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
