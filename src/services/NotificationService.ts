// server/src/services/NotificationService.ts
import { NotificationToken } from '../models/NotificationToken';
import { User } from '../models/User';
import { Expo } from 'expo-server-sdk';

export class NotificationService {
  private expo: Expo;

  constructor() {
    this.expo = new Expo();
  }

  /**
   * 📱 Enregistrer un token de notification
   */
  async registerToken(userId: string, token: string, platform?: string): Promise<void> {
    try {
      // Vérifier si le token existe déjà
      const existing = await NotificationToken.findOne({
        where: { user_id: userId, token }
      });

      if (existing) {
        console.log(`✅ Token déjà enregistré pour l'utilisateur ${userId}`);
        return;
      }

      await NotificationToken.create({
        user_id: userId,
        token,
        platform: platform || 'unknown'
      });

      console.log(`✅ Token enregistré pour l'utilisateur ${userId}`);
    } catch (error) {
      console.error('❌ Erreur registerToken:', error);
      throw new Error('Erreur lors de l\'enregistrement du token');
    }
  }

  /**
   * 🔔 Envoyer une notification à un utilisateur spécifique
   */
  async sendToUser(userId: string, title: string, body: string, data: any = {}): Promise<void> {
    try {
      // Récupérer les tokens de l'utilisateur
      const tokens = await NotificationToken.findAll({
        where: { user_id: userId }
      });

      if (tokens.length === 0) {
        console.log(`⚠️ Aucun token trouvé pour l'utilisateur ${userId}`);
        return;
      }

      const messages = tokens
        .filter(t => Expo.isExpoPushToken(t.token))
        .map(t => ({
          to: t.token,
          sound: 'default',
          title: title,
          body: body,
          data: data,
        }));

      if (messages.length === 0) {
        console.log(`⚠️ Aucun token Expo valide pour l'utilisateur ${userId}`);
        return;
      }

      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('❌ Erreur d\'envoi:', error);
        }
      }

      console.log(`✅ Notification envoyée à ${messages.length} tokens pour l'utilisateur ${userId}`);
    } catch (error) {
      console.error('❌ Erreur sendToUser:', error);
      throw new Error('Erreur lors de l\'envoi de la notification');
    }
  }

  /**
   * 👥 Envoyer une notification à un groupe d'utilisateurs
   */
  async sendToGroup(title: string, body: string, data: any = {}, roles: string[] = []): Promise<void> {
    try {
      // Récupérer les utilisateurs par rôle
      const whereCondition: any = { actif: true };
      if (roles.length > 0) {
        whereCondition.role = roles;
      }

      const users = await User.findAll({
        where: whereCondition,
        attributes: ['id']
      });

      if (users.length === 0) {
        console.log('⚠️ Aucun utilisateur trouvé pour ce groupe');
        return;
      }

      const userIds = users.map(u => u.id);

      // Récupérer tous les tokens
      const tokens = await NotificationToken.findAll({
        where: { user_id: userIds }
      });

      if (tokens.length === 0) {
        console.log('⚠️ Aucun token trouvé pour ce groupe');
        return;
      }

      const messages = tokens
        .filter(t => Expo.isExpoPushToken(t.token))
        .map(t => ({
          to: t.token,
          sound: 'default',
          title: title,
          body: body,
          data: data,
        }));

      if (messages.length === 0) {
        console.log('⚠️ Aucun token Expo valide pour ce groupe');
        return;
      }

      const chunks = this.expo.chunkPushNotifications(messages);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('❌ Erreur d\'envoi:', error);
        }
      }

      console.log(`✅ Notification envoyée à ${messages.length} tokens pour le groupe`);
    } catch (error) {
      console.error('❌ Erreur sendToGroup:', error);
      throw new Error('Erreur lors de l\'envoi de la notification');
    }
  }

  /**
   * 🗑️ Supprimer un token de notification
   */
  async removeToken(userId: string, token: string): Promise<void> {
    try {
      const result = await NotificationToken.destroy({
        where: {
          user_id: userId,
          token: token
        }
      });

      if (result > 0) {
        console.log(`✅ Token supprimé pour l'utilisateur ${userId}`);
      } else {
        console.log(`⚠️ Token non trouvé pour l'utilisateur ${userId}`);
      }
    } catch (error) {
      console.error('❌ Erreur removeToken:', error);
      throw new Error('Erreur lors de la suppression du token');
    }
  }
}