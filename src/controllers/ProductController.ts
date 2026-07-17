import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ProductRepository } from '../repositories/ProductRepository';

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

  toggleActif = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).utilisateur;
    if (currentUser.role === 'manager') {
      return this.forbidden(res, 'Seul l\'administrateur peut supprimer un produit');
    }
    } catch (err) {
      this.error(res, 'Erreur lors de la modification');
    }
  };
}