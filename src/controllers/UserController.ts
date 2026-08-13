import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { UserRepository } from '../repositories/UserRepository';
import { ProductCommission } from '../models/ProductCommission';
import { BonusPalier } from '../models/BonusPalier';
import { Product } from '../models/Product';

export class UserController extends BaseController {
  private userRepo: UserRepository;

  constructor() {
    super();
    this.userRepo = new UserRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.userRepo.findAll({
        attributes: { exclude: ['mot_de_passe'] },
        include: [
          { model: ProductCommission, as: 'commissions_produits', include: [{ model: Product, as: 'produit' }] },
          { model: BonusPalier, as: 'bonus_paliers' }
        ]
      });
      this.success(res, users);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération des utilisateurs');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.userRepo.findById(req.params.id as string, {
        attributes: { exclude: ['mot_de_passe'] },
        include: [
          { model: ProductCommission, as: 'commissions_produits', include: [{ model: Product, as: 'produit' }] },
          { model: BonusPalier, as: 'bonus_paliers' }
        ]
      });
      if (!user) return this.notFound(res, 'Utilisateur non trouvé');
      this.success(res, user);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nom, motDePasse, mot_de_passe, role, commission_mode, commission_defaut } = req.body;
    const password = motDePasse || mot_de_passe;

    const user = await this.userRepo.create({
      nom,
      mot_de_passe: password,
      role,
      commission_mode: commission_mode || 'forfaitaire',
      commission_defaut: commission_defaut || 1000
    });

    this.created(res, user.toJSON());
  } catch (err: any) {
    console.error('ERREUR CREATE:', err.message, err.errors);  // ← Ajouter ceci
    this.error(res, 'Erreur lors de la création');
  }
};

  update = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const { nom, role, commission_mode, commission_defaut, mot_de_passe } = req.body;

    const user = await this.userRepo.findById(id);
    if (!user) return this.notFound(res, 'Utilisateur non trouvé');

    if (nom) user.nom = nom;
    if (role) user.role = role;
    if (commission_mode) user.commission_mode = commission_mode;
    if (commission_defaut !== undefined) user.commission_defaut = commission_defaut;
    if (mot_de_passe && mot_de_passe.length >= 6) {
      user.mot_de_passe = mot_de_passe; // Le hook beforeUpdate va le hasher
    }

    await user.save();

    const updated = await this.userRepo.findById(id, {
      attributes: { exclude: ['mot_de_passe'] }
    });
    this.success(res, updated);
  } catch (err) {
    this.error(res, 'Erreur lors de la modification');
  }
};

 toggleActif = async (req: Request, res: Response): Promise<void> => {
  try {
    const currentUser = (req as any).utilisateur;
    if (currentUser.role !== 'admin') {
      return this.forbidden(res, 'Seul l\'administrateur peut désactiver un utilisateur');
    }

    const user = await this.userRepo.findById(req.params.id as string);
    if (!user) return this.notFound(res, 'Utilisateur non trouvé');

    user.actif = !user.actif;
    await user.save();

    this.success(res, user.toJSON());
  } catch (err) {
    this.error(res, 'Erreur');
  }
};

  changerMotDePasse = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { mot_de_passe } = req.body;

      if (!mot_de_passe || mot_de_passe.length < 6) {
        return this.badRequest(res, 'Mot de passe invalide (min 6 caractères)');
      }

      const user = await this.userRepo.findById(id as string);
      if (!user) return this.notFound(res, 'Utilisateur non trouvé');

      user.mot_de_passe = mot_de_passe;
      await user.save();

      this.success(res, null, 'Mot de passe modifié');
    } catch (err) {
      this.error(res, 'Erreur lors de la modification');
    }
  };

  /**
   * Définit (ou met à jour) la commission d'un commercial pour un produit
   * spécifique, utilisée quand son commission_mode est "par_produit".
   */
  addCommissionProduit = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { product_id, montant } = req.body;

      if (!product_id || montant === undefined || montant === null) {
        return this.badRequest(res, 'Produit et montant requis');
      }

      const user = await this.userRepo.findById(userId as string);
      if (!user) return this.notFound(res, 'Utilisateur non trouvé');

      const [commission, created] = await ProductCommission.findOrCreate({
        where: { user_id: userId, product_id },
        defaults: { user_id: userId, product_id, montant }
      });

      if (!created && Number(commission.montant) !== Number(montant)) {
        commission.montant = montant;
        await commission.save();
      }

      const complet = await ProductCommission.findByPk(commission.id, {
        include: [{ model: Product, as: 'produit' }]
      });
      this.success(res, complet, 'Commission produit enregistrée');
    } catch (err: any) {
      console.error('Erreur addCommissionProduit:', err.message);
      this.error(res, 'Erreur lors de l\'enregistrement de la commission');
    }
  };

  removeCommissionProduit = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, productId } = req.params;
      await ProductCommission.destroy({ where: { user_id: userId, product_id: productId } });
      this.success(res, null, 'Commission produit supprimée');
    } catch (err: any) {
      console.error('Erreur removeCommissionProduit:', err.message);
      this.error(res, 'Erreur lors de la suppression de la commission');
    }
  };

  /**
   * Définit (ou met à jour) un palier de bonus mensuel pour un commercial :
   * "à partir de N commandes dans le mois, bonus de M FCFA".
   */
  addBonusPalier = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId } = req.params;
      const { nombre_commandes, montant } = req.body;

      const seuil = parseInt(nombre_commandes);
      if (!seuil || seuil <= 0 || montant === undefined || montant === null || Number(montant) < 0) {
        return this.badRequest(res, 'Nombre de commandes (positif) et montant requis');
      }

      const user = await this.userRepo.findById(userId as string);
      if (!user) return this.notFound(res, 'Utilisateur non trouvé');

      const [palier, created] = await BonusPalier.findOrCreate({
        where: { user_id: userId, nombre_commandes: seuil },
        defaults: { user_id: userId, nombre_commandes: seuil, montant }
      });

      if (!created && Number(palier.montant) !== Number(montant)) {
        palier.montant = montant;
        await palier.save();
      }

      this.success(res, palier, 'Palier de bonus enregistré');
    } catch (err: any) {
      console.error('Erreur addBonusPalier:', err.message);
      this.error(res, 'Erreur lors de l\'enregistrement du palier');
    }
  };

  removeBonusPalier = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, palierId } = req.params;
      await BonusPalier.destroy({ where: { id: palierId, user_id: userId } });
      this.success(res, null, 'Palier de bonus supprimé');
    } catch (err: any) {
      console.error('Erreur removeBonusPalier:', err.message);
      this.error(res, 'Erreur lors de la suppression du palier');
    }
  };
}