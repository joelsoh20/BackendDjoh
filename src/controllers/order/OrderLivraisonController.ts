import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { Order } from '../../models/Order';
import { StockLivraison } from '../../models/StockLivraison';

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

  // Assigner un service de livraison à une commande
  assignerServiceLivraison = async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId, serviceLivraisonId } = req.body;
      const userRole = (req as any).utilisateur.role;

      if (userRole !== 'manager' && userRole !== 'admin') {
        return this.forbidden(res, 'Seul un manager ou admin peut assigner un service de livraison');
      }

      const order = await Order.findByPk(orderId);
      if (!order) return this.notFound(res, 'Commande non trouvée');

      const verification = await this.verifierStockServiceLivraison(
        order.product_id, order.quantite, serviceLivraisonId
      );

      if (!verification.valid) {
        return this.badRequest(res, verification.message!);
      }

      order.service_livraison_id = serviceLivraisonId;
      await order.save();

      await StockLivraison.decrement(
        { quantite: order.quantite },
        { where: { service_id: serviceLivraisonId, product_id: order.product_id } }
      );

      this.success(res, order, '✅ Service de livraison assigné avec succès');
    } catch (error) {
      console.error('❌ Erreur assignation:', error);
      this.error(res, 'Erreur lors de l\'assignation');
    }
  };
}