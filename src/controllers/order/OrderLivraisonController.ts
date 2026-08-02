import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { Commande } from '../../models/Commande';
import { CommandeLigne } from '../../models/CommandeLigne';
import { StockLivraison } from '../../models/StockLivraison';
import { Database } from '../../config/database';

export class OrderLivraisonController extends OrderController {

  // Vérifie si un produit est disponible dans le service de livraison
  private async verifierStockServiceLivraison(
    productId: string,
    quantite: number,
    serviceLivraisonId: string
  ): Promise<{ valid: boolean; message?: string }> {
    try {
      const stockService = await StockLivraison.findOne({
        where: { service_id: serviceLivraisonId, product_id: productId }
      });

      if (!stockService) {
        return { valid: false, message: '❌ Ce produit n\'est pas disponible dans ce service.' };
      }

      if (stockService.quantite < quantite) {
        return { valid: false, message: `❌ Quantité insuffisante. Stock disponible : ${stockService.quantite}` };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, message: '❌ Erreur lors de la vérification du stock' };
    }
  }

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

      for (const ligne of lignes) {
        const verification = await this.verifierStockServiceLivraison(
          ligne.product_id, ligne.quantite, serviceLivraisonId
        );
        if (!verification.valid) {
          await transaction.rollback();
          return this.badRequest(res, `${verification.message} (produit concerné dans la commande)`);
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
