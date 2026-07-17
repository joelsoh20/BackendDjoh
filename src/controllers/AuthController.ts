import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { AuthService } from '../services/AuthService';

export class AuthController extends BaseController {
  private authService: AuthService;

  constructor() {
    super();
    this.authService = new AuthService();
  }

  login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { identifiant, motDePasse } = req.body;
    
    console.log('Login reçu:', { identifiant, motDePasse }); // ← Ajoute ce log
    
    if (!identifiant || !motDePasse) {
      return this.badRequest(res, 'Identifiant et mot de passe requis');
    }

    const result = await this.authService.login(identifiant, motDePasse);
    
    if (!result.success) {
      return this.unauthorized(res, result.message);
    }

    this.success(res, result.data);
  } catch (err) {
    this.error(res, 'Erreur serveur');
  }
};

  getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const result = await this.authService.getProfile(userId);
      this.success(res, result.data);
    } catch (err) {
      this.error(res, 'Erreur serveur');
    }
  };

  changerMotDePasse = async (req: Request, res: Response): Promise<void> => {
 try {
  const currentUser = (req as any).utilisateur;
  if (currentUser.role === 'manager') {
    return this.forbidden(res, 'Vous ne pouvez pas modifier votre mot de passe. Contactez l\'administrateur.');
  }
  
  const userId = (req as any).utilisateur.id;
  const { ancienMotDePasse, nouveauMotDePasse } = req.body;
  const result = await this.authService.changerMotDePasse(userId, ancienMotDePasse, nouveauMotDePasse);
  
  if (!result.success) {
    return this.badRequest(res, result.message);
  }

  this.success(res, null, result.message);
} catch (err) {
  this.error(res, 'Erreur serveur');
}
  };
}