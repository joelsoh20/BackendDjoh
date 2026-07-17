import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { OrderRepository } from '../repositories/OrderRepository';
import { CommissionService } from '../services/CommissionService';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Op } from 'sequelize';

export class OrderController extends BaseController {
  private orderRepo: OrderRepository;
  private commissionService: CommissionService;

  constructor() {
    super();
    this.orderRepo = new OrderRepository();
    this.commissionService = new CommissionService();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const { statut, page = 1, limit = 20 } = req.query;
      const where: any = {};
      if (statut && statut !== 'tous') where.statut = statut;

      const orders = await this.orderRepo.findAllWithRelations({
        where,
        order: [['date_creation', 'DESC']],
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string)
      });

      const total = await this.orderRepo.count({ where });

      this.success(res, { items: orders, total, page: parseInt(page as string), limit: parseInt(limit as string) });
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const order = await this.orderRepo.findById(req.params.id as string, {
        include: ['produit', 'commercial']
      });
      if (!order) return this.notFound(res, 'Commande non trouvée');
      this.success(res, order);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  getMesCommandes = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const orders = await this.orderRepo.findByCommercial(userId);
      this.success(res, orders);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).utilisateur.id;
    const { client_nom, client_telephone, client_quartier, lignes, prix_total } = req.body;
    const { v4: uuidv4 } = require('uuid');
    const groupId = uuidv4();

    // Vérifier le stock
    const { StockLivraison } = require('../models/StockLivraison');
    for (const ligne of lignes) {
      const stocks = await StockLivraison.findAll({
        where: { product_id: ligne.product_id }
      });
      const totalDispo = stocks.reduce((sum: number, s: any) => sum + s.quantite, 0);
      if (totalDispo < (ligne.quantite || 1)) {
        return this.badRequest(res, `Stock insuffisant. Disponible: ${totalDispo}`);
      }
    }

    const totalCatalogue = lignes.reduce((sum: number, l: any) => sum + (l.prix_unitaire_reel * l.quantite), 0);
    const prixFinal = prix_total && prix_total > 0 ? prix_total : totalCatalogue;

    const orders = [];
    for (const ligne of lignes) {
      const proportion = totalCatalogue > 0 ? (ligne.prix_unitaire_reel * ligne.quantite) / totalCatalogue : 1 / lignes.length;
      const prixLigne = Math.round(prixFinal * proportion);
      const prixUnitaire = ligne.quantite > 0 ? Math.round(prixLigne / ligne.quantite) : prixLigne;

      const order = await this.orderRepo.create({
        client_nom,
        client_telephone: client_telephone || null,
        client_quartier: client_quartier || null,
        product_id: ligne.product_id,
        quantite: ligne.quantite || 1,
        prix_unitaire_reel: prixUnitaire,
        commercial_id: userId,
        frais_livraison: 1000,
        commission_commercial: 0,
        group_id: groupId,
      });
      orders.push(order);
    }

    // Notification aux admins et managers
    try {
      const commercial = await User.findByPk(userId, { attributes: ['nom'] });
      const adminsManagers = await User.findAll({
        where: {
          role: { [Op.in]: ['admin', 'manager'] },
          actif: true
        },
        attributes: ['id']
      });

      const { NotificationService } = require('../services/NotificationService');
      const notifService = new NotificationService();

      for (const admin of adminsManagers) {
        await notifService.sendToUser(
          admin.id,
          '🛍️ Nouvelle commande',
          `${commercial?.nom || 'Un commercial'} a envoyé une commande de ${lignes.length} produit(s) pour ${client_nom}`
        );
      }
    } catch (notifErr) {
      console.error('Erreur notification:', notifErr);
    }

    this.created(res, orders);
  } catch (err: any) {
    console.error('Create erreur:', err.message);
    this.error(res, 'Erreur lors de la création');
  }
};

 updateStatut = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { statut, frais_livraison, service_livraison_id } = req.body;

    const order = await this.orderRepo.findById(id);
    if (!order) return this.notFound(res, 'Commande non trouvée');
    if (order.cloture_id) return this.badRequest(res, 'Commande clôturée');

    order.statut = statut;

    if (statut === 'livree_payee') {
      order.date_statut_livree = new Date();
      order.frais_livraison = frais_livraison || 1000;
      order.service_livraison_id = service_livraison_id || null;
      if (order.commission_commercial === 0) {
        order.commission_commercial = await this.commissionService.calculerCommission(order);
      }

      // Déduire uniquement du stock du service de livraison
      if (service_livraison_id) {
        const { StockLivraison } = require('../models/StockLivraison');
        const stockLivraison = await StockLivraison.findOne({
          where: { service_id: service_livraison_id, product_id: order.product_id }
        });
        if (stockLivraison && stockLivraison.quantite >= order.quantite) {
          stockLivraison.quantite -= order.quantite;
          await stockLivraison.save();
        }
      }
    }

    if (statut === 'annulee') {
  order.motif_annulation = req.body.motif || null;
  const { NotificationService } = require('../services/NotificationService');
  const notifService = new NotificationService();
  await notifService.sendToUser(
    order.commercial_id,
    '❌ Commande annulée',
    `Votre commande a été annulée. Motif: ${order.motif_annulation || 'Non spécifié'}`
  );
}

    await order.save();

    const { ServiceLivraison } = require('../models/ServiceLivraison');
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

 getMonDashboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).utilisateur.id;
    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const uneSemaine = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);

    const toutes = await Order.findAll({
      where: { 
        commercial_id: userId,
        date_creation: { [Op.gte]: uneSemaine }
      },
      include: [
        { model: Product, as: 'produit' },
        { model: User, as: 'commercial', attributes: ['id', 'nom'] }
      ],
      order: [['date_creation', 'DESC']]
    }) as any[];

    const recues = toutes.filter((o: any) => o.statut === 'recue').length;
    const livrees = toutes.filter((o: any) => o.statut === 'livree_payee');
    const annulees = toutes.filter((o: any) => o.statut === 'annulee').length;

    const commissionTotale = livrees.reduce((sum: number, o: any) => sum + Number(o.commission_commercial), 0);
    const produitsVendus = livrees.reduce((sum: number, o: any) => sum + o.quantite, 0);
    const totalVentes = livrees.reduce((sum: number, o: any) => sum + (Number(o.prix_unitaire_reel) * o.quantite), 0);

    const totalCommandesMois = toutes.filter((o: any) => {
      const date = new Date(o.date_creation);
      return date >= debutMois && date <= maintenant;
    }).length;
    const bonus = totalCommandesMois >= 110 ? 10000 : 0;

    const commandesSimplifiees = toutes.map((o: any) => ({
      id: o.id,
      group_id: o.group_id,
      client_nom: o.client_nom,
      date_creation: o.date_creation,
      statut: o.statut,
      motif_annulation: o.motif_annulation,
      produit_nom: o.produit?.nom || 'Sans nom',
      quantite: o.quantite,
      prix_unitaire_reel: o.prix_unitaire_reel,
      total: Number(o.prix_unitaire_reel) * o.quantite,
    }));

    this.success(res, {
      commandesEnvoyees: recues,
      commandesLivrees: livrees.length,
      commandesAnnulees: annulees,
      commissionTotale,
      produitsVendus,
      totalVentes,
      totalCommandesMois,
      bonus,
      dernieresCommandes: commandesSimplifiees.slice(0, 50),
    });
  } catch (err: any) {
    console.error('getMonDashboard erreur:', err.message);
    this.error(res, 'Erreur');
  }
};

updateOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).utilisateur.id;
    const order = await this.orderRepo.findById(req.params.id as string);
    
    if (!order) return this.notFound(res, 'Commande non trouvée');
    if (order.commercial_id !== userId) return this.forbidden(res, 'Pas votre commande');
    if (order.statut !== 'recue') return this.badRequest(res, 'Commande déjà traitée');
    if (order.cloture_id) return this.badRequest(res, 'Commande clôturée');

    await this.orderRepo.update(req.params.id as string, req.body);
    this.success(res, await this.orderRepo.findById(req.params.id as string));
  } catch (err) {
    this.error(res, 'Erreur');
  }
};

deleteOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).utilisateur.id;
    const order = await this.orderRepo.findById(req.params.id as string);
    
    if (!order) return this.notFound(res, 'Commande non trouvée');
    if (order.commercial_id !== userId) return this.forbidden(res, 'Pas votre commande');
    if (order.statut !== 'recue') return this.badRequest(res, 'Commande déjà traitée');

    order.statut = 'annulee';
    order.motif_annulation = 'Annulé par le commercial';
    await order.save();
    this.success(res, order, 'Commande annulée');
  } catch (err) {
    this.error(res, 'Erreur');
  }
};
}