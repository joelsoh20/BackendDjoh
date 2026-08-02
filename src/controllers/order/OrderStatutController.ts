import { Request, Response } from 'express';
import { OrderController } from './OrderController';
import { CommissionService } from '../../services/CommissionService';
import { Commande } from '../../models/Commande';
import { CommandeLigne } from '../../models/CommandeLigne';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { ServiceLivraison } from '../../models/ServiceLivraison';
import { StockLivraison } from '../../models/StockLivraison';
import { Database } from '../../config/database';

export class OrderStatutController extends OrderController {
  private commissionService: CommissionService;

  constructor() {
    super();
    this.commissionService = new CommissionService();
  }

  updateStatut = async (req: Request, res: Response): Promise<void> => {
    const sequelize = Database.getInstance();
    const transaction = await sequelize.transaction();
    try {
      const id = req.params.id as string;
      const { statut, frais_livraison, service_livraison_id } = req.body;
      const commande = await Commande.findByPk(id, {
        include: [{ model: CommandeLigne, as: 'lignes' }],
        transaction
      });

      if (!commande) {
        await transaction.rollback();
        return this.notFound(res, 'Commande non trouvée');
      }

      if (commande.cloture_id) {
        await transaction.rollback();
        return this.badRequest(res, 'Commande clôturée');
      }

      const lignes = (commande as any).lignes as CommandeLigne[];
      const statutOriginal = commande.statut;

      if (statut === 'livree_payee') {
        commande.date_statut_livree = new Date();
        commande.frais_livraison = frais_livraison || 1000;
        commande.service_livraison_id = service_livraison_id || null;

        // Commission calculée UNE SEULE FOIS pour toute la commande
        if (Number(commande.commission_commercial) === 0) {
          commande.commission_commercial = await this.commissionService.calculerCommission(commande, lignes);
        }

        // Décrémente le stock du service de livraison pour chaque produit de la commande
        if (service_livraison_id) {
          for (const ligne of lignes) {
            const stockLivraison = await StockLivraison.findOne({
              where: { service_id: service_livraison_id, product_id: ligne.product_id },
              transaction
            });
            if (stockLivraison && stockLivraison.quantite >= ligne.quantite) {
              stockLivraison.quantite -= ligne.quantite;
              await stockLivraison.save({ transaction });
            }
          }
        }
      }

      if (statut === 'annulee') {
        commande.motif_annulation = req.body.motif || null;

        // Si la commande était déjà livrée, on annule après coup pour
        // corriger une erreur : on restitue le stock au service de
        // livraison concerné (admin/manager uniquement, route protégée —
        // pas de limite de temps).
        if (statutOriginal === 'livree_payee' && commande.service_livraison_id) {
          for (const ligne of lignes) {
            const stockLivraison = await StockLivraison.findOne({
              where: { service_id: commande.service_livraison_id, product_id: ligne.product_id },
              transaction
            });
            if (stockLivraison) {
              stockLivraison.quantite += ligne.quantite;
              await stockLivraison.save({ transaction });
            }
          }
        }
      }

      commande.statut = statut;
      await commande.save({ transaction });
      await transaction.commit();

      const commandeAvecRelations = await Commande.findByPk(id, {
        include: [
          { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
          { model: User, as: 'commercial', attributes: ['id', 'nom'] },
          { model: ServiceLivraison, as: 'service_livraison' }
        ]
      });

      // Notifications (après commit)
      try {
        const { NotificationService } = require('../../services/NotificationService');
        const notifService = new NotificationService();
        if (statut === 'livree_payee') {
          const admins = await User.findAll({ where: { role: 'admin' as any, actif: true }, attributes: ['id'] });
          const commercial = (commandeAvecRelations as any)?.commercial;
          for (const a of admins) {
            await notifService.sendToUser(a.id, '✅ Commande livrée', `${commercial?.nom} - commande pour ${commande.client_nom} livrée.`);
          }
          await notifService.sendToUser(
            commande.commercial_id,
            '✅ Commande livrée',
            `Votre commande pour ${commande.client_nom} a été livrée. Commission: ${commande.commission_commercial} FCFA`
          );
        }
        if (statut === 'annulee' && statutOriginal === 'livree_payee') {
          const motif = commande.motif_annulation ? ` Motif : ${commande.motif_annulation}` : '';
          await notifService.sendToUser(
            commande.commercial_id,
            '❌ Commande annulée',
            `Votre commande livrée pour ${commande.client_nom} a été annulée.${motif}`
          );
        }
      } catch (notifErr) {
        console.error('Erreur notification statut:', notifErr);
      }

      this.success(res, commandeAvecRelations);
    } catch (err: any) {
      await transaction.rollback();
      console.error('❌ updateStatut :', err);
      this.error(res, 'Erreur lors de la modification');
    }
  };
}
