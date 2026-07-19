import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { UserRepository } from '../repositories/UserRepository';

export class UserController extends BaseController {
  private userRepo: UserRepository;

  constructor() {
    super();
    this.userRepo = new UserRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.userRepo.findAll({
        attributes: { exclude: ['mot_de_passe'] }
      });
      this.success(res, users);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération des utilisateurs');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const user = await this.userRepo.findById(req.params.id as string, {
        attributes: { exclude: ['mot_de_passe'] }
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
}