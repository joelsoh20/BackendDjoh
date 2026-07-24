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
      // Utilise "nom" au lieu de "identifiant"
      const { nom, mot_de_passe } = req.body;  // ← Changé !
      
      // console.log('Login reçu:', { nom, mot_de_passe: '***' });
      
      if (!nom || !mot_de_passe) {
        return this.badRequest(res, 'Nom et mot de passe requis');
      }

      const result = await this.authService.login(nom, mot_de_passe);  // ← Changé !
      
      if (!result.success) {
        return this.unauthorized(res, result.message);
      }

      this.success(res, result.data);
    } catch (err) {
      console.error('Erreur login:', err);
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