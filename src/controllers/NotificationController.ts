import { Request, Response } from 'express';
import { NotificationService } from '../services/NotificationService';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  registerToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const { token, platform } = req.body;

      if (!token) {
        res.status(400).json({ 
          success: false, 
          message: '❌ Token de notification requis' 
        });
        return;
      }

      await this.notificationService.registerToken(userId, token, platform);
      res.status(200).json({ 
        success: true, 
        message: '✅ Token de notification enregistré' 
      });
    } catch (error) {
      console.error('❌ Erreur registerToken:', error);
      res.status(500).json({ 
        success: false, 
        message: '❌ Erreur lors de l\'enregistrement du token' 
      });
    }
  };

  /**
   * 🔔 Envoyer une notification à un utilisateur spécifique
   * Route: POST /api/notifications/send
   * Access: Manager/Admin uniquement
   */
  sendToUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const { userId, title, body, data } = req.body;

      if (!userId || !title || !body) {
        res.status(400).json({ 
          success: false, 
          message: '❌ userId, title et body sont requis' 
        });
        return;
      }

      await this.notificationService.sendToUser(userId, title, body, data || {});
      
      res.status(200).json({ 
        success: true, 
        message: '✅ Notification envoyée avec succès' 
      });
    } catch (error) {
      console.error('❌ Erreur sendToUser:', error);
      res.status(500).json({ 
        success: false, 
        message: '❌ Erreur lors de l\'envoi de la notification' 
      });
    }
  };

  /**
   * 👥 Envoyer une notification à un groupe d'utilisateurs
   * Route: POST /api/notifications/send-group
   * Access: Manager/Admin uniquement
   */
  sendToGroup = async (req: Request, res: Response): Promise<void> => {
    try {
      const { title, body, data, roles } = req.body;

      if (!title || !body) {
        res.status(400).json({ 
          success: false, 
          message: '❌ title et body sont requis' 
        });
        return;
      }

      await this.notificationService.sendToGroup(title, body, data || {}, roles || []);
      
      res.status(200).json({ 
        success: true, 
        message: '✅ Notification envoyée au groupe' 
      });
    } catch (error) {
      console.error('❌ Erreur sendToGroup:', error);
      res.status(500).json({ 
        success: false, 
        message: '❌ Erreur lors de l\'envoi de la notification' 
      });
    }
  };

  /**
   * 🗑️ Supprimer un token de notification
   * Route: DELETE /api/notifications/token
   * Access: Tous utilisateurs authentifiés
   */
  removeToken = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = (req as any).utilisateur.id;
      const { token } = req.body;

      if (!token) {
        res.status(400).json({ 
          success: false, 
          message: '❌ Token requis' 
        });
        return;
      }

      await this.notificationService.removeToken(userId, token);
      
      res.status(200).json({ 
        success: true, 
        message: '✅ Token supprimé avec succès' 
      });
    } catch (error) {
      console.error('❌ Erreur removeToken:', error);
      res.status(500).json({ 
        success: false, 
        message: '❌ Erreur lors de la suppression du token' 
      });
    }
  };
}