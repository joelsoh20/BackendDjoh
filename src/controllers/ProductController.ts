import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ProductRepository } from '../repositories/ProductRepository';
import { CommandeLigne } from '../models/CommandeLigne';
import { Stock } from '../models/Stock';
import { StockLivraison } from '../models/StockLivraison';
import { ProductCommission } from '../models/ProductCommission';

export class ProductController extends BaseController {
  private productRepo: ProductRepository;

  constructor() {
    super();
    this.productRepo = new ProductRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const products = await this.productRepo.findAll();
      this.success(res, products);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.productRepo.findById(req.params.id as string);
      if (!product) return this.notFound(res, 'Produit non trouvé');
      this.success(res, product);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const { nom, prix_catalogue, cout_revient } = req.body;
      if (!nom || prix_catalogue === undefined) {
        return this.badRequest(res, 'Nom et prix catalogue requis');
      }
      const product = await this.productRepo.create({ nom, prix_catalogue, cout_revient: cout_revient || 0 });
      this.created(res, product);
    } catch (err) {
      this.error(res, 'Erreur lors de la création');
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const product = await this.productRepo.findById(id as string);
      if (!product) return this.notFound(res, 'Produit non trouvé');

      await this.productRepo.update(id as string, req.body);
      const updated = await this.productRepo.findById(id as string);
      this.success(res, updated);
    } catch (err) {
      this.error(res, 'Erreur lors de la modification');
    }
  };

  /**
   * Active / désactive (masque) un produit.
   * Cette méthode était incomplète : elle vérifiait le rôle puis ne
   */
  toggleActif = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).utilisateur;
      if (currentUser.role === 'manager') {
        return this.forbidden(res, 'Seul l\'administrateur peut modifier la visibilité d\'un produit');
      }

      const { id } = req.params;
      const product = await this.productRepo.findById(id as string);
      if (!product) return this.notFound(res, 'Produit non trouvé');

      product.actif = !product.actif;
      await product.save();

      this.success(res, product, product.actif ? 'Produit activé' : 'Produit masqué');
    } catch (err: any) {
      console.error('Erreur toggleActif produit:', err.message);
      this.error(res, 'Erreur lors de la modification');
    }
  };

  /**
   * Supprime définitivement un produit (admin uniquement).
   *
   * Refuse la suppression si le produit apparaît dans au moins une
   * commande : le supprimer fausserait l'historique comptable (chiffre
   * d'affaires, commissions, clôtures déjà validées) et casserait les
   * références en base. Dans ce cas on oriente vers le masquage, qui
   * retire le produit des nouvelles commandes sans toucher au passé.
   */
  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const currentUser = (req as any).utilisateur;
      if (currentUser.role !== 'admin') {
        return this.forbidden(res, 'Seul l\'administrateur peut supprimer un produit');
      }

      const { id } = req.params;
      const product = await this.productRepo.findById(id as string);
      if (!product) return this.notFound(res, 'Produit non trouvé');

      const nbLignes = await CommandeLigne.count({ where: { product_id: id } });
      if (nbLignes > 0) {
        return this.badRequest(
          res,
          `Ce produit apparaît dans ${nbLignes} commande(s) : le supprimer fausserait l'historique comptable. Utilisez plutôt "Masquer" pour le retirer des nouvelles commandes.`
        );
      }

      // Le produit n'a jamais été vendu : on peut nettoyer ses stocks
      // puis le supprimer sans impact sur la comptabilité.
      await StockLivraison.destroy({ where: { product_id: id } });
      await Stock.destroy({ where: { product_id: id } });
      await ProductCommission.destroy({ where: { product_id: id } });
      await this.productRepo.delete(id as string);

      this.success(res, null, 'Produit supprimé');
    } catch (err: any) {
      console.error('Erreur suppression produit:', err.message);
      this.error(res, 'Erreur lors de la suppression');
    }
  };
}