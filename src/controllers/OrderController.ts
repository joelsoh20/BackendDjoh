import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { OrderRepository } from '../repositories/OrderRepository';
import { CommissionService } from '../services/CommissionService';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Op } from 'sequelize';
import { StockLivraison } from '../models/StockLivraison';

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

    // Sauvegarder le statut actuel AVANT de le changer
    const statutActuel = order.statut;

    if (statut === 'livree_payee') {
      order.date_statut_livree = new Date();
      order.frais_livraison = frais_livraison || 1000;
      order.service_livraison_id = service_livraison_id || null;
      
      if (order.commission_commercial === 0) {
        order.commission_commercial = await this.commissionService.calculerCommission(order);
      }

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

      // Notification au commercial
  try {
    const { NotificationService } = require('../services/NotificationService');
    const notifService = new NotificationService();
    const commercial = await User.findByPk(order.commercial_id, { attributes: ['nom'] });
    
    await notifService.sendToUser(
      order.commercial_id,
      '✅ Commande livrée',
      `Votre commande pour ${order.client_nom} a été livrée. Commission: ${order.commission_commercial} FCFA`
    );

    // Notification aux autres admins/managers
    const adminsManagers = await User.findAll({
      where: { role: { [Op.in]: ['admin', 'manager'] }, actif: true, id: { [Op.ne]: (req as any).utilisateur.id } },
      attributes: ['id']
    });
    for (const a of adminsManagers) {
      await notifService.sendToUser(a.id, '✅ Commande livrée', `${commercial?.nom} - commande pour ${order.client_nom} livrée.`);
    }
  } catch (notifErr) {
    console.error('Erreur notification validation:', notifErr);
  }
}


    if (statut === 'annulee') {
  console.log('=== ANNULATION ===');
  console.log('statutActuel:', statutActuel);
  console.log('service_livraison_id:', order.service_livraison_id);
  console.log('date_statut_livree:', order.date_statut_livree);
      // Vérifier le délai d'1h
      if (order.date_statut_livree) {
        const uneHeure = 60 * 60 * 1000;
        const tempsEcoule = Date.now() - new Date(order.date_statut_livree).getTime();
        if (tempsEcoule > uneHeure) {
          return this.badRequest(res, "Délai d'annulation dépassé (1h après validation).");
        }
      }

      // Restaurer le stock si la commande était livrée
      if (statutActuel === 'livree_payee' && order.service_livraison_id) {
        const { StockLivraison } = require('../models/StockLivraison');
        const stockLivraison = await StockLivraison.findOne({
          where: { service_id: order.service_livraison_id, product_id: order.product_id }
        });
        if (stockLivraison) {
          stockLivraison.quantite += order.quantite;
          await stockLivraison.save();
        }
      }

      order.motif_annulation = req.body.motif || null;

      // Notification au commercial
  try {
    const { NotificationService } = require('../services/NotificationService');
    const notifService = new NotificationService();
    
    await notifService.sendToUser(
      order.commercial_id,
      '❌ Commande annulée',
      `Votre commande a été annulée. Motif: ${order.motif_annulation || 'Non spécifié'}`
    );
  } catch (notifErr) {
    console.error('Erreur notification annulation:', notifErr);
  }
}

    // Changer le statut APRES les vérifications
    order.statut = statut;
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

    const toutesMois = await Order.findAll({
      where: { 
        commercial_id: userId,
        date_creation: { [Op.gte]: debutMois }
      },
      include: [
        { model: Product, as: 'produit' },
        { model: User, as: 'commercial', attributes: ['id', 'nom'] }
      ],
      order: [['date_creation', 'DESC']]
    }) as any[];

    const toutes = toutesMois.filter((o: any) => new Date(o.date_creation) >= uneSemaine);

    const recues = toutesMois.filter((o: any) => o.statut === 'recue').length;
    const livrees = toutesMois.filter((o: any) => o.statut === 'livree_payee');
    const annulees = toutesMois.filter((o: any) => o.statut === 'annulee').length;

    const commissionTotale = livrees.reduce((sum: number, o: any) => sum + Number(o.commission_commercial), 0);
    const produitsVendus = livrees.reduce((sum: number, o: any) => sum + o.quantite, 0);
    const totalVentes = livrees.reduce((sum: number, o: any) => sum + (Number(o.prix_unitaire_reel) * o.quantite), 0);

    const totalCommandesMois = toutesMois.length;
    const bonus = totalCommandesMois >= 110 ? 10000 : 0;

    // Évolution sur 6 mois
    const evolution = [];
    for (let i = 5; i >= 0; i--) {
      const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      const fin = i === 0 ? maintenant : new Date(maintenant.getFullYear(), maintenant.getMonth() - i + 1, 0);
      
      const commandesPeriode = toutesMois.filter((o: any) => {
        const date = new Date(o.date_creation);
        return date >= debut && date <= fin && o.statut === 'livree_payee';
      });

      evolution.push({
        mois: debut.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
        nb_commandes: commandesPeriode.length,
        total_ventes: commandesPeriode.reduce((sum: number, o: any) => sum + (Number(o.prix_unitaire_reel) * o.quantite), 0),
      });
    }

    // ✅ CORRECTION : Ajout de client_telephone
    const commandesSimplifiees = toutes.map((o: any) => ({
      id: o.id,
      group_id: o.group_id,
      client_nom: o.client_nom,
      client_telephone: o.client_telephone, // ← AJOUTE CETTE LIGNE
      date_creation: o.date_creation,
      statut: o.statut,
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
      evolution,
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


 // Vérifie si un produit est disponible dans le service de livraison
 
private async verifierStockServiceLivraison(
  productId: string,
  quantite: number,
  serviceLivraisonId: string
): Promise<{ valid: boolean; message?: string }> {
  try {
    // Vérifier si le produit existe dans ce service
    const stockService = await StockLivraison.findOne({
      where: {
        service_id: serviceLivraisonId,
        product_id: productId
      }
    });

    if (!stockService) {
      return {
        valid: false,
        message: `❌ Ce produit n'est pas disponible dans le service de livraison sélectionné`
      };
    }

    // Vérifier la quantité disponible
    if (stockService.quantite < quantite) {
      return {
        valid: false,
        message: `❌ Quantité insuffisante. Stock disponible : ${stockService.quantite}`
      };
    }

    return { valid: true };
  } catch (error) {
    console.error('Erreur vérification stock:', error);
    return {
      valid: false,
      message: '❌ Erreur lors de la vérification du stock'
    };
  }
}

 // Assigner un service de livraison à une commande (Manager/Admin uniquement)
 
assignerServiceLivraison = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, serviceLivraisonId } = req.body;
    const userRole = (req as any).utilisateur.role;

    // Vérifier que l'utilisateur est manager ou admin
    if (userRole !== 'manager' && userRole !== 'admin') {
      res.status(403).json({
        success: false,
        message: '❌ Seul un manager ou admin peut assigner un service de livraison'
      });
      return;
    }

    // Récupérer la commande
    const order = await Order.findByPk(orderId);
    if (!order) {
      res.status(404).json({
        success: false,
        message: '❌ Commande non trouvée'
      });
      return;
    }

    // ✅ VÉRIFICATION DU STOCK AVANT ASSIGNATION
    const verification = await this.verifierStockServiceLivraison(
      order.product_id,
      order.quantite,
      serviceLivraisonId
    );

    if (!verification.valid) {
      res.status(400).json({
        success: false,
        message: verification.message
      });
      return;
    }

    // ✅ Mettre à jour la commande avec le service de livraison
    order.service_livraison_id = serviceLivraisonId;
    await order.save();

    // 📦 Mettre à jour le stock du service
    await StockLivraison.decrement(
      { quantite: order.quantite },
      {
        where: {
          service_id: serviceLivraisonId,
          product_id: order.product_id
        }
      }
    );

    res.status(200).json({
      success: true,
      message: '✅ Service de livraison assigné avec succès',
      data: order
    });

  } catch (error) {
    console.error('❌ Erreur assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation du service de livraison'
    });
  }
};
}