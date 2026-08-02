import { Request, Response } from 'express';
import { BaseController } from '../BaseController';
import { CommandeRepository } from '../../repositories/CommandeRepository';
import { Commande } from '../../models/Commande';
import { CommandeLigne } from '../../models/CommandeLigne';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Database } from '../../config/database';
import { Op } from 'sequelize';

export class OrderController extends BaseController {
  protected commandeRepo: CommandeRepository;

  constructor() {
    super();
    this.commandeRepo = new CommandeRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const { statut, page = 1, limit = 20 } = req.query;
      const where: any = {};
      if (statut && statut !== 'tous') where.statut = statut;

      const commandes = await this.commandeRepo.findAllWithRelations({
        where,
        order: [['date_creation', 'DESC']],
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string)
      });

      const total = await this.commandeRepo.count({ where });
      this.success(res, { items: commandes, total, page: parseInt(page as string), limit: parseInt(limit as string) });
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const commande = await this.commandeRepo.findById(req.params.id as string, {
        include: [
          { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
          { model: User, as: 'commercial' }
        ]
      });
      if (!commande) return this.notFound(res, 'Commande non trouvée');
      this.success(res, commande);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  getMesCommandes = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const commandes = await this.commandeRepo.findByCommercial(userId);
      this.success(res, commandes);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  /**
   * Crée une commande : un en-tête Commande + une CommandeLigne par produit.
   * Le frais de livraison et la commission ne sont plus dupliqués par
   * produit : ils vivent uniquement sur l'en-tête et seront renseignés
   * au moment de la livraison (voir OrderStatutController).
   */
  create = async (req: Request, res: Response): Promise<void> => {
    const sequelize = Database.getInstance();
    const transaction = await sequelize.transaction();
    try {
      const userId = (req as any).utilisateur.id;
      const { client_nom, client_telephone, client_quartier, lignes, prix_total } = req.body;

      if (!Array.isArray(lignes) || lignes.length === 0) {
        await transaction.rollback();
        return this.badRequest(res, 'Au moins un produit est requis');
      }

      const { StockLivraison } = require('../../models/StockLivraison');
      for (const ligne of lignes) {
        const stocks = await StockLivraison.findAll({ where: { product_id: ligne.product_id } });
        const totalDispo = stocks.reduce((sum: number, s: any) => sum + s.quantite, 0);
        if (totalDispo < (ligne.quantite || 1)) {
          await transaction.rollback();
          return this.badRequest(res, `Stock insuffisant. Disponible: ${totalDispo}`);
        }
      }

      const totalCatalogue = lignes.reduce((sum: number, l: any) => sum + (l.prix_unitaire_reel * l.quantite), 0);
      const prixFinal = prix_total && prix_total > 0 ? prix_total : totalCatalogue;

      const commande = await Commande.create({
        client_nom, client_telephone: client_telephone || null, client_quartier: client_quartier || null,
        commercial_id: userId, frais_livraison: 1000, commission_commercial: 0,
        prix_total: Math.round(prixFinal), statut: 'recue'
      }, { transaction });

      for (const ligne of lignes) {
        const proportion = totalCatalogue > 0 ? (ligne.prix_unitaire_reel * ligne.quantite) / totalCatalogue : 1 / lignes.length;
        const prixLigne = Math.round(prixFinal * proportion);
        const prixUnitaire = ligne.quantite > 0 ? Math.round(prixLigne / ligne.quantite) : prixLigne;

        await CommandeLigne.create({
          commande_id: commande.id,
          product_id: ligne.product_id,
          quantite: ligne.quantite || 1,
          prix_unitaire_reel: prixUnitaire,
        }, { transaction });
      }

      await transaction.commit();

      // Notification (après commit, ne doit pas faire échouer la création)
      try {
        const commercial = await User.findByPk(userId, { attributes: ['nom'] });
        const adminsManagers = await User.findAll({
          where: { role: { [Op.in]: ['admin', 'manager'] }, actif: true },
          attributes: ['id']
        });
        const { NotificationService } = require('../../services/NotificationService');
        const notifService = new NotificationService();
        for (const admin of adminsManagers) {
          await notifService.sendToUser(admin.id, '🛍️ Nouvelle commande',
            `${commercial?.nom || 'Un commercial'} a envoyé une commande pour ${client_nom}`);
        }
      } catch (notifErr) { console.error('Erreur notification:', notifErr); }

      const commandeComplete = await this.commandeRepo.findById(commande.id, {
        include: [{ model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] }]
      });
      this.created(res, commandeComplete);
    } catch (err: any) {
      await transaction.rollback();
      console.error('Create erreur:', err.message);
      this.error(res, 'Erreur lors de la création');
    }
  };

  /**
   * Modification par le commercial tant que la commande est "recue".
   * Champs client autorisés sur l'en-tête ; product_id/quantite/prix_unitaire_reel
   * (si fournis) s'appliquent à la première ligne — l'appli mobile n'édite
   * pour l'instant qu'un seul produit par commande (limitation déjà présente
   * avant cette refonte, à traiter côté frontend pour le multi-produits).
   * Ni le statut, ni les frais, ni la commission, ni la clôture ne sont
   * modifiables via cette route.
   */
  /**
   * Modification par le commercial tant que la commande est "recue".
   * Champs client autorisés sur l'en-tête. Si un tableau "lignes" est
   * fourni, il remplace entièrement les produits de la commande (permet
   * désormais d'éditer une commande multi-produits, pas seulement la
   * première ligne). L'ancien format à un seul produit
   * (product_id/quantite/prix_unitaire_reel) reste accepté pour
   * compatibilité et modifie la première ligne uniquement.
   * Ni le statut, ni les frais, ni la commission, ni la clôture ne sont
   * modifiables via cette route.
   */
  updateOrder = async (req: Request, res: Response): Promise<void> => {
    const sequelize = Database.getInstance();
    const transaction = await sequelize.transaction();
    try {
      const userId = (req as any).utilisateur.id;
      const commande = await Commande.findByPk(req.params.id as string, {
        include: [{ model: CommandeLigne, as: 'lignes' }],
        transaction
      });
      if (!commande) { await transaction.rollback(); return this.notFound(res, 'Commande non trouvée'); }
      if (commande.commercial_id !== userId) { await transaction.rollback(); return this.forbidden(res, 'Pas votre commande'); }
      if (commande.statut !== 'recue') { await transaction.rollback(); return this.badRequest(res, 'Commande déjà traitée'); }
      if (commande.cloture_id) { await transaction.rollback(); return this.badRequest(res, 'Commande clôturée'); }

      const { client_nom, client_telephone, client_quartier, product_id, quantite, prix_unitaire_reel, lignes: nouvellesLignes } = req.body;

      const champsCommande: any = {};
      if (client_nom !== undefined) champsCommande.client_nom = client_nom;
      if (client_telephone !== undefined) champsCommande.client_telephone = client_telephone;
      if (client_quartier !== undefined) champsCommande.client_quartier = client_quartier;
      if (Object.keys(champsCommande).length > 0) {
        await commande.update(champsCommande, { transaction });
      }

      if (Array.isArray(nouvellesLignes) && nouvellesLignes.length > 0) {
        // Remplacement complet des lignes (multi-produits)
        await CommandeLigne.destroy({ where: { commande_id: commande.id }, transaction });
        for (const l of nouvellesLignes) {
          await CommandeLigne.create({
            commande_id: commande.id,
            product_id: l.product_id,
            quantite: l.quantite || 1,
            prix_unitaire_reel: l.prix_unitaire_reel,
          }, { transaction });
        }
        const nouveauTotal = nouvellesLignes.reduce((sum: number, l: any) => sum + Number(l.prix_unitaire_reel) * (l.quantite || 1), 0);
        await commande.update({ prix_total: Math.round(nouveauTotal) }, { transaction });
      } else {
        // Compatibilité : édition de la première ligne uniquement
        const lignesActuelles = (commande as any).lignes as CommandeLigne[];
        if (lignesActuelles?.length && (product_id !== undefined || quantite !== undefined || prix_unitaire_reel !== undefined)) {
          const premiereLigne = lignesActuelles[0];
          const champsLigne: any = {};
          if (product_id !== undefined) champsLigne.product_id = product_id;
          if (quantite !== undefined) champsLigne.quantite = quantite;
          if (prix_unitaire_reel !== undefined) champsLigne.prix_unitaire_reel = prix_unitaire_reel;
          await premiereLigne.update(champsLigne, { transaction });

          const toutesLignes = await CommandeLigne.findAll({ where: { commande_id: commande.id }, transaction });
          const nouveauTotal = toutesLignes.reduce((sum, l) => sum + Number(l.prix_unitaire_reel) * l.quantite, 0);
          await commande.update({ prix_total: Math.round(nouveauTotal) }, { transaction });
        }
      }

      await transaction.commit();
      this.success(res, await this.commandeRepo.findById(req.params.id as string, {
        include: [{ model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] }]
      }));
    } catch (err) {
      await transaction.rollback();
      this.error(res, 'Erreur');
    }
  };

  deleteOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const commande = await this.commandeRepo.findById(req.params.id as string);
      if (!commande) return this.notFound(res, 'Commande non trouvée');
      if (commande.commercial_id !== userId) return this.forbidden(res, 'Pas votre commande');
      if (commande.statut !== 'recue') return this.badRequest(res, 'Commande déjà traitée');

      commande.statut = 'annulee';
      commande.motif_annulation = 'Annulé par le commercial';
      await commande.save();
      this.success(res, commande, 'Commande annulée');
    } catch (err) { this.error(res, 'Erreur'); }
  };
}
