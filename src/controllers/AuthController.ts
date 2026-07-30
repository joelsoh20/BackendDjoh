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
    // 🔍 LOGS DE DEBUG
    console.log('📦 Corps brut reçu:', req.body);
    //console.log('📦 Headers Content-Type:', req.headers['content-type']);
    //console.log('📦 Clés dans le corps:', Object.keys(req.body || {}));
    
    // 🔥 Accepte les deux formats (nom/identifiant et mot_de_passe/motDePasse)
    const nom = req.body.nom || req.body.identifiant;
    const mot_de_passe = req.body.mot_de_passe || req.body.motDePasse;
    
    //console.log('📦 Login reçu:', { nom, mot_de_passe: mot_de_passe ? '***' : 'undefined' });
    
    if (!nom || !mot_de_passe) {
      console.log('❌ Champs manquants:', { nom: !!nom, mot_de_passe: !!mot_de_passe });
      res.status(400).json({ 
        success: false, 
        message: 'Veuillez fournir un nom et un mot de passe' 
      });
      return;
    }

    console.log('🔍 Recherche utilisateur:', nom);
    const result = await this.authService.login(nom, mot_de_passe);
    //console.log('📊 Résultat auth:', { success: result.success, message: result.message });
    
    if (!result.success) {
      const errorMessage = result.message || 'Identifiants incorrects';
      
      if (errorMessage.includes('Identifiant')) {
        res.status(401).json({ 
          success: false, 
          message: '❌ Nom d\'utilisateur incorrect' 
        });
      } else if (errorMessage.includes('Mot de passe')) {
        res.status(401).json({ 
          success: false, 
          message: '❌ Mot de passe incorrect' 
        });
      } else {
        res.status(401).json({ 
          success: false, 
          message: '❌ Identifiants incorrects' 
        });
      }
      return;
    }

    console.log('✅ Connexion réussie pour:', nom);
    res.status(200).json({
      success: true,
      message: '✅ Connexion réussie',
      data: result.data
    });
    
  } catch (err) {
    console.error('❌ Erreur login:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Erreur serveur, veuillez réessayer' 
    });
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