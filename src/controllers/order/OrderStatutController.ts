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
import { verifierStockService, formaterMessageManquants } from '../../utils/verifierStockService';

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
      // Verrou de ligne : deux requêtes concurrentes (double-tap, retry
      // réseau) sur la MÊME commande sont ainsi sérialisées — la seconde
      // attend que la première ait commité avant de lire le statut, ce
      // qui rend les gardes d'idempotence ci-dessous fiables même en cas
      // d'appels simultanés (pas seulement séquentiels).
      const commande = await Commande.findByPk(id, {
        include: [{ model: CommandeLigne, as: 'lignes' }],
        transaction,
        lock: transaction.LOCK.UPDATE
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
        // Idempotence : la commande est déjà livrée, on ne rejoue pas le
        // mouvement de stock ni le recalcul de commission. Sans cette
        // garde, un double-tap sur "Livré" ou un retry réseau décrémente
        // deux fois le stock du service de livraison pour la même
        // commande. Pour corriger frais/service après coup, on utilise
        // corrigerLivraison, pas ce endpoint.
        if (statutOriginal === 'livree_payee') {
          await transaction.commit();
          const commandeInchangee = await Commande.findByPk(id, {
            include: [
              { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
              { model: User, as: 'commercial', attributes: ['id', 'nom'] },
              { model: ServiceLivraison, as: 'service_livraison' }
            ]
          });
          return this.success(res, commandeInchangee, 'Commande déjà livrée (aucune modification)');
        }

        // Vérifie AVANT toute modification que le service choisi a bien
        // tout le stock nécessaire. Auparavant, une rupture de stock ne
        // bloquait rien : la commande était quand même marquée livrée,
        // silencieusement, sans décrémenter le produit manquant.
        if (service_livraison_id) {
          const { ok, manquants } = await verifierStockService(
            service_livraison_id,
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
        }

        commande.date_statut_livree = new Date();
        commande.frais_livraison = frais_livraison || 1000;
        commande.service_livraison_id = service_livraison_id || null;

        // Commission calculée UNE SEULE FOIS pour toute la commande
        if (Number(commande.commission_commercial) === 0) {
          commande.commission_commercial = await this.commissionService.calculerCommission(commande, lignes);
        }

        // Décrémente le stock du service de livraison pour chaque produit
        // de la commande (déjà validé suffisant ci-dessus). decrement()
        // génère un UPDATE atomique ("quantite = quantite - X") plutôt
        // qu'un lire-puis-écrire : deux commandes livrées en même temps
        // par le même service ne peuvent donc pas s'écraser l'une
        // l'autre et faire perdre un mouvement de stock.
        if (service_livraison_id) {
          for (const ligne of lignes) {
            await StockLivraison.decrement(
              { quantite: ligne.quantite },
              { where: { service_id: service_livraison_id, product_id: ligne.product_id }, transaction }
            );
          }
        }
      }

      if (statut === 'annulee') {
        commande.motif_annulation = req.body.motif || null;

        // Si la commande était déjà livrée, "annuler" ici signifie
        // corriger une erreur : elle repart à l'état "validée" pour être
        // retraitée (pas "annulée" définitivement). Le stock est restitué
        // au service de livraison concerné (admin/manager uniquement,
        // route protégée — pas de limite de temps).
        if (statutOriginal === 'livree_payee') {
          if (commande.service_livraison_id) {
            for (const ligne of lignes) {
              await StockLivraison.increment(
                { quantite: ligne.quantite },
                { where: { service_id: commande.service_livraison_id, product_id: ligne.product_id }, transaction }
              );
            }
          }
          commande.statut = 'validee';
          await commande.save({ transaction });
          await transaction.commit();

          const commandeRevertee = await Commande.findByPk(id, {
            include: [
              { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
              { model: User, as: 'commercial', attributes: ['id', 'nom'] },
              { model: ServiceLivraison, as: 'service_livraison' }
            ]
          });

          try {
            const { NotificationService } = require('../../services/NotificationService');
            const notifService = new NotificationService();
            const motifTexte = commande.motif_annulation ? ` Motif : ${commande.motif_annulation}` : '';
            await notifService.sendToUser(
              commande.commercial_id,
              '⚠️ Livraison annulée',
              `La livraison de votre commande pour ${commande.client_nom} a été annulée et remise en attente de retraitement.${motifTexte}`,
              { type: 'commande', orderId: commande.id }
            );
          } catch (notifErr) {
            console.error('Erreur notification statut:', notifErr);
          }

          return this.success(res, commandeRevertee);
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
            await notifService.sendToUser(a.id, '✅ Commande livrée', `${commercial?.nom} - commande pour ${commande.client_nom} livrée.`,
              { type: 'commande', orderId: commande.id });
          }
          await notifService.sendToUser(
            commande.commercial_id,
            '✅ Commande livrée',
            `Votre commande pour ${commande.client_nom} a été livrée. Commission: ${commande.commission_commercial} FCFA`,
            { type: 'commande', orderId: commande.id }
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

  /**
   * Corrige les frais de livraison et/ou le service de livraison d'une
   * commande DÉJÀ livrée, sans repasser par tout le cycle
   * annuler → revalider → relivrer. Pour les erreurs de saisie
   * fréquentes signalées par les utilisateurs (mauvais service
   * sélectionné, montant de frais erroné).
   *
   * Si le service change, le stock de l'ancien service est restitué et
   * celui du nouveau est vérifié puis décrémenté (même vérification
   * complète que pour une livraison normale — tous les manques sont
   * listés d'un coup, pas juste le premier).
   */
  corrigerLivraison = async (req: Request, res: Response): Promise<void> => {
    const sequelize = Database.getInstance();
    const transaction = await sequelize.transaction();
    try {
      const id = req.params.id as string;
      const { frais_livraison, service_livraison_id } = req.body;

      // Verrou de ligne : voir le commentaire équivalent dans updateStatut.
      // Sans lui, deux corrections concurrentes sur la même commande
      // peuvent toutes deux lire l'ancien service_livraison_id avant que
      // l'une des deux ne commite, et donc toutes deux restituer/décrémenter
      // le stock — un double mouvement au lieu d'un seul.
      const commande = await Commande.findByPk(id, {
        include: [{ model: CommandeLigne, as: 'lignes' }],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      if (!commande) {
        await transaction.rollback();
        return this.notFound(res, 'Commande non trouvée');
      }

      if (commande.statut !== 'livree_payee') {
        await transaction.rollback();
        return this.badRequest(res, 'Seule une commande déjà livrée peut être corrigée ici');
      }

      if (commande.cloture_id) {
        await transaction.rollback();
        return this.badRequest(res, 'Commande clôturée, correction impossible');
      }

      const lignes = (commande as any).lignes as CommandeLigne[];
      const ancienServiceId = commande.service_livraison_id;
      const nouveauServiceId = service_livraison_id !== undefined ? (service_livraison_id || null) : ancienServiceId;
      const serviceChange = nouveauServiceId !== ancienServiceId;

      if (serviceChange) {
        // Le nouveau service doit avoir assez de stock AVANT tout
        // mouvement — vérification complète, tous les manques listés.
        if (nouveauServiceId) {
          const { ok, manquants } = await verifierStockService(
            nouveauServiceId,
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
        }

        // Restitue le stock à l'ancien service (UPDATE atomique)
        if (ancienServiceId) {
          for (const ligne of lignes) {
            await StockLivraison.increment(
              { quantite: ligne.quantite },
              { where: { service_id: ancienServiceId, product_id: ligne.product_id }, transaction }
            );
          }
        }

        // Décrémente le nouveau service (UPDATE atomique)
        if (nouveauServiceId) {
          for (const ligne of lignes) {
            await StockLivraison.decrement(
              { quantite: ligne.quantite },
              { where: { service_id: nouveauServiceId, product_id: ligne.product_id }, transaction }
            );
          }
        }

        commande.service_livraison_id = nouveauServiceId;
      }

      if (frais_livraison !== undefined && frais_livraison !== null) {
        const montant = Number(frais_livraison);
        if (isNaN(montant) || montant < 0) {
          await transaction.rollback();
          return this.badRequest(res, 'Montant des frais de livraison invalide');
        }
        commande.frais_livraison = montant;
      }

      await commande.save({ transaction });
      await transaction.commit();

      const commandeCorrigee = await Commande.findByPk(id, {
        include: [
          { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
          { model: User, as: 'commercial', attributes: ['id', 'nom'] },
          { model: ServiceLivraison, as: 'service_livraison' }
        ]
      });

      this.success(res, commandeCorrigee, 'Livraison corrigée');
    } catch (err: any) {
      await transaction.rollback();
      console.error('❌ corrigerLivraison :', err);
      this.error(res, 'Erreur lors de la correction');
    }
  };
}
