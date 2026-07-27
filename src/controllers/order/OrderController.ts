import { Request, Response } from 'express';
import { BaseController } from '../BaseController';
import { OrderRepository } from '../../repositories/OrderRepository';
import { Order } from '../../models/Order';
import { Product } from '../../models/Product';
import { User } from '../../models/User';
import { Op } from 'sequelize';

export class OrderController extends BaseController {
  protected orderRepo: OrderRepository;

  constructor() {
    super();
    this.orderRepo = new OrderRepository();
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

      const { StockLivraison } = require('../../models/StockLivraison');
      for (const ligne of lignes) {
        const stocks = await StockLivraison.findAll({ where: { product_id: ligne.product_id } });
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
          client_nom, client_telephone: client_telephone || null, client_quartier: client_quartier || null,
          product_id: ligne.product_id, quantite: ligne.quantite || 1,
          prix_unitaire_reel: prixUnitaire, commercial_id: userId,
          frais_livraison: 1000, commission_commercial: 0, group_id: groupId,
        });
        orders.push(order);
      }

      // Notification
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

      this.created(res, orders);
    } catch (err: any) {
      console.error('Create erreur:', err.message);
      this.error(res, 'Erreur lors de la création');
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
    } catch (err) { this.error(res, 'Erreur'); }
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
    } catch (err) { this.error(res, 'Erreur'); }
  };
}