import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { CommissionService } from '../../services/CommissionService';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Op } from 'sequelize';

export class OrderStatutController extends OrderController {
  private commissionService: CommissionService;

  constructor() {
    super();
    this.commissionService = new CommissionService();
  }

  updateStatut = async (req: Request, res: Response): Promise<void> => {
    try {
      const id = req.params.id as string;
      const { statut, frais_livraison, service_livraison_id } = req.body;

      const order = await this.orderRepo.findById(id);
      if (!order) return this.notFound(res, 'Commande non trouvée');
      if (order.cloture_id) return this.badRequest(res, 'Commande clôturée');

      const statutActuel = order.statut;

      if (statut === 'livree_payee') {
        order.date_statut_livree = new Date();
        order.frais_livraison = frais_livraison || 1000;
        order.service_livraison_id = service_livraison_id || null;

        if (order.commission_commercial === 0) {
          order.commission_commercial = await this.commissionService.calculerCommission(order);
        }

        if (service_livraison_id) {
          const { StockLivraison } = require('../../models/StockLivraison');
          const stockLivraison = await StockLivraison.findOne({
            where: { service_id: service_livraison_id, product_id: order.product_id }
          });
          if (stockLivraison && stockLivraison.quantite >= order.quantite) {
            stockLivraison.quantite -= order.quantite;
            await stockLivraison.save();
          }
        }

        // Notification
        try {
          const { NotificationService } = require('../../services/NotificationService');
          const notifService = new NotificationService();
          const commercial = await User.findByPk(order.commercial_id, { attributes: ['nom'] });
          await notifService.sendToUser(order.commercial_id, '✅ Commande livrée',
            `Votre commande pour ${order.client_nom} a été livrée. Commission: ${order.commission_commercial} FCFA`);
          
          const adminsManagers = await User.findAll({
            where: { role: { [Op.in]: ['admin', 'manager'] }, actif: true, id: { [Op.ne]: (req as any).utilisateur.id } },
            attributes: ['id']
          });
          for (const a of adminsManagers) {
            await notifService.sendToUser(a.id, '✅ Commande livrée', `${commercial?.nom} - commande pour ${order.client_nom} livrée.`);
          }
        } catch (notifErr) { console.error('Erreur notification validation:', notifErr); }
      }

      if (statut === 'annulee') {
        if (order.date_statut_livree) {
          const uneHeure = 60 * 60 * 1000;
          const tempsEcoule = Date.now() - new Date(order.date_statut_livree).getTime();
          if (tempsEcoule > uneHeure) {
            return this.badRequest(res, "Délai d'annulation dépassé (1h après validation).");
          }
        }

        if (statutActuel === 'livree_payee' && order.service_livraison_id) {
          const { StockLivraison } = require('../../models/StockLivraison');
          const stockLivraison = await StockLivraison.findOne({
            where: { service_id: order.service_livraison_id, product_id: order.product_id }
          });
          if (stockLivraison) {
            stockLivraison.quantite += order.quantite;
            await stockLivraison.save();
          }
        }

        order.motif_annulation = req.body.motif || null;

        // Notification
        try {
          const { NotificationService } = require('../../services/NotificationService');
          const notifService = new NotificationService();
          await notifService.sendToUser(order.commercial_id, '❌ Commande annulée',
            `Votre commande a été annulée. Motif: ${order.motif_annulation || 'Non spécifié'}`);
        } catch (notifErr) { console.error('Erreur notification annulation:', notifErr); }
      }

      order.statut = statut;
      await order.save();

      const { ServiceLivraison } = require('../../models/ServiceLivraison');
      const orderWithService = await Order.findByPk(id, {
        include: [
          { model: Product, as: 'produit' },
          { model: User, as: 'commercial', attributes: ['id', 'nom'] },
          { model: ServiceLivraison, as: 'service_livraison' }
        ]
      });

      this.success(res, orderWithService);
    } catch (err: any) {
      console.error('updateStatut erreur:', err.message);
      this.error(res, 'Erreur lors de la modification');
    }
  };
}