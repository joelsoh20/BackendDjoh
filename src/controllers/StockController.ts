import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { StockRepository } from '../repositories/StockRepository';
import { User } from '../models/User';
import { ServiceLivraison } from '../models/ServiceLivraison';
import { StockLivraison } from '../models/StockLivraison';

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

    // Manager : vérifications
    if (user?.role === 'manager') {
      // Interdire la diminution de stock
      if (qte < 0) {
        return this.forbidden(res, 'Vous ne pouvez pas diminuer le stock. Contactez l\'administrateur.');
      }

      // Vérifier le délai d'1h si le produit a déjà du stock
      const stockExistant = await this.stockRepo.findByProduct(product_id);
      if (stockExistant && stockExistant.date_modification) {
        const uneHeure = 60 * 60 * 1000;
        const tempsEcoule = Date.now() - new Date(stockExistant.date_modification).getTime();
        if (tempsEcoule > uneHeure) {
          return this.forbidden(res, 'Délai de modification dépassé (1h). Contactez l\'administrateur.');
        }
      }
    }

    // Ajouter au stock général
    await this.stockRepo.augmenterStock(product_id, qte);

    // Répartir entre tous les services de livraison actifs
    const services = await ServiceLivraison.findAll({ where: { actif: true } });

    if (services.length > 0 && qte > 0) {
      const qteParService = Math.floor(qte / services.length);
      const reste = qte % services.length;

      for (let i = 0; i < services.length; i++) {
        const quantiteService = qteParService + (i === 0 ? reste : 0);
        if (quantiteService > 0) {
          const [stockLivraison] = await StockLivraison.findOrCreate({
            where: { service_id: services[i].id, product_id },
            defaults: { service_id: services[i].id, product_id, quantite: 0 }
          });
          stockLivraison.quantite += quantiteService;
          await stockLivraison.save();
        }
      }
    }

    const updated = await this.stockRepo.findByProduct(product_id);
    this.success(res, updated, `Stock mis à jour (+${qte})`);
  } catch (err: any) {
    console.error('Erreur ajout stock:', err.message);
    this.error(res, 'Erreur');
  }
};
}