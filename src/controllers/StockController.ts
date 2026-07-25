import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { StockRepository } from '../repositories/StockRepository';
import { User } from '../models/User';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { StockLivraison } from '../models/StockLivraison';
import { Op } from 'sequelize';

export class StockController extends BaseController {
  private stockRepo: StockRepository;

  constructor() {
    super();
    this.stockRepo = new StockRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const stocks = await this.stockRepo.findAllWithProduct();
      this.success(res, stocks);
    } catch (err) {
      this.error(res, 'Erreur');
    }
  };

  getByProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const stock = await this.stockRepo.findByProduct(req.params.productId as string);
      this.success(res, stock);
    } catch (err) {
      this.error(res, 'Erreur');
    }
  };

  ajouter = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const user = await User.findByPk(userId);
      const { product_id, quantite } = req.body;
      const qte = parseInt(quantite);

      if (user?.role === 'manager') {
        if (qte < 0) {
          return this.forbidden(res, 'Vous ne pouvez pas diminuer le stock. Contactez l\'administrateur.');
        }
        const stockExistant = await this.stockRepo.findByProduct(product_id);
        if (stockExistant && stockExistant.date_modification) {
          const uneHeure = 60 * 60 * 1000;
          const tempsEcoule = Date.now() - new Date(stockExistant.date_modification).getTime();
          if (tempsEcoule > uneHeure) {
            return this.forbidden(res, 'Délai de modification dépassé. Contactez l\'administrateur.');
          }
        }
      }

      await this.stockRepo.augmenterStock(product_id, qte);

      // Notification à l'admin si c'est un manager qui modifie
      if (user?.role === 'manager') {
        try {
          const admins = await User.findAll({
            where: { role: 'admin', actif: true },
            attributes: ['id']
          });

          const { NotificationService } = require('../services/NotificationService');
          const notifService = new NotificationService();
          const produit = await this.stockRepo.findByProduct(product_id);

          for (const admin of admins) {
            await notifService.sendToUser(
              admin.id,
              '📦 Stock modifié',
             `${user.nom} (manager) a ${qte >= 0 ? 'ajouté' : 'retiré'} ${Math.abs(qte)} unité(s) ${(produit as any)?.produit?.nom ? `de ${(produit as any).produit.nom}` : ''} au stock général.`
            );
          }
        } catch (notifErr) {
          console.error('Erreur notification stock:', notifErr);
        }
      }

      const updated = await this.stockRepo.findByProduct(product_id);
      const action = qte >= 0 ? 'augmenté' : 'diminué';
      this.success(res, updated, `Stock ${action} (${qte >= 0 ? '+' : ''}${qte})`);
    } catch (err: any) {
      console.error('Erreur ajout stock:', err.message);
      this.error(res, 'Erreur');
    }
  };
}