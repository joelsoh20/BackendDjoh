import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { StockLivraison } from '../models/StockLivraison';
import { Stock } from '../models/Stock';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { Op } from 'sequelize';

export class ServiceLivraisonController extends BaseController {

  getAll = async (req: Request, res: Response): Promise<void> => {
    const services = await ServiceLivraison.findAll({
      include: [{ model: StockLivraison, as: 'stocks', include: [{ model: Product, as: 'produit' }] }]
    });
    this.success(res, services);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const { nom, contact, zone } = req.body;
    const service = await ServiceLivraison.create({ nom, contact, zone });
    this.created(res, service);
  };

  toggleActif = async (req: Request, res: Response): Promise<void> => {
    const service = await ServiceLivraison.findByPk(req.params.id as string);
    if (!service) return this.notFound(res, 'Service non trouvé');
    service.actif = !service.actif;
    await service.save();
    this.success(res, service);
  };

  ajouterStock = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const user = await User.findByPk(userId);
      const { service_id, product_id, quantite } = req.body;
      const qte = parseInt(quantite);

      // Manager : pas de diminution
      if (user?.role === 'manager' && qte < 0) {
        return this.forbidden(res, 'Vous ne pouvez pas diminuer le stock.');
      }

      // Vérifier le stock général disponible
      const stockGeneral = await Stock.findOne({ where: { product_id } });
      const disponible = stockGeneral ? stockGeneral.quantite : 0;

      if (qte > disponible) {
        return this.badRequest(res, `Stock insuffisant. Disponible dans le stock général : ${disponible}`);
      }

      // Déduire du stock général
      if (stockGeneral) {
        stockGeneral.quantite -= qte;
        await stockGeneral.save();
      }

      // Ajouter au stock du service de livraison
      const [stock] = await StockLivraison.findOrCreate({
        where: { service_id, product_id },
        defaults: { service_id, product_id, quantite: 0 }
      });
      stock.quantite += qte;
      await stock.save();

      // Notification à l'admin si c'est un manager
      if (user?.role === 'manager') {
        try {
          const admins = await User.findAll({
            where: { role: 'admin', actif: true },
            attributes: ['id']
          });

          const service = await ServiceLivraison.findByPk(service_id, { attributes: ['nom'] });
          const produit = await Product.findByPk(product_id, { attributes: ['nom'] });

          const { NotificationService } = require('../services/NotificationService');
          const notifService = new NotificationService();

          for (const admin of admins) {
            await notifService.sendToUser(
              admin.id,
              '🚚 Stock service modifié',
              `${user.nom} (manager) a transféré ${qte} unité(s) de ${produit?.nom || 'produit'} vers le service "${service?.nom || 'Inconnu'}".`
            );
          }
        } catch (notifErr) {
          console.error('Erreur notification stock service:', notifErr);
        }
      }

      this.success(res, stock, `${qte} unité(s) transférée(s) du stock général au service`);
    } catch (err: any) {
      console.error('Erreur ajouterStock:', err.message);
      this.error(res, 'Erreur');
    }
  };

  getStocks = async (req: Request, res: Response): Promise<void> => {
    const stocks = await StockLivraison.findAll({
      where: { service_id: req.params.serviceId as string },
      include: [{ model: Product, as: 'produit' }]
    });
    this.success(res, stocks);
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).utilisateur;
      
      if (currentUser.role !== 'admin') {
        return this.forbidden(res, 'Seul l\'administrateur peut supprimer un service de livraison.');
      }

      const id = req.params.id as string;
      const service = await ServiceLivraison.findByPk(id);
      if (!service) return this.notFound(res, 'Service non trouvé');

      const stocksService = await StockLivraison.findAll({ where: { service_id: id } });

      for (const s of stocksService) {
        const stockGeneral = await Stock.findOne({ where: { product_id: s.product_id } });
        if (stockGeneral) {
          stockGeneral.quantite += s.quantite;
          await stockGeneral.save();
        } else {
          await Stock.create({ product_id: s.product_id, quantite: s.quantite });
        }
      }

      await StockLivraison.destroy({ where: { service_id: id } });
      await service.destroy();

      this.success(res, null, `Service supprimé. ${stocksService.length} produit(s) retourné(s) au stock général.`);
    } catch (err: any) {
      console.error('Erreur DELETE service:', err.message);
      this.error(res, 'Erreur lors de la suppression');
    }
  };
}