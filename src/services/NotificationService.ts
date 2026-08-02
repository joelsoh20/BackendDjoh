// server/src/services/NotificationService.ts
import { NotificationToken } from '../models/NotificationToken';
import { User } from '../models/User';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

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
   * Envoie les messages à Expo, INSPECTE les tickets retournés (jusqu'ici
   * ignorés — c'est ce qui rendait les échecs invisibles en production :
   * un ticket "error" avec details.error = 'InvalidCredentials' signale
   * des identifiants push (FCM/APNs) mal configurés côté EAS, tandis que
   * 'DeviceNotRegistered' signale un token obsolète à nettoyer).
   */
  private async envoyerMessages(messages: ExpoPushMessage[]): Promise<void> {
    if (messages.length === 0) return;
    console.log(`🔔 [envoyerMessages] envoi de ${messages.length} message(s) à Expo :`, JSON.stringify(messages.map(m => ({ to: m.to, title: m.title }))));

    const chunks = this.expo.chunkPushNotifications(messages);
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await this.expo.sendPushNotificationsAsync(chunk);
        console.log('🔔 [envoyerMessages] tickets reçus d\'Expo :', JSON.stringify(ticketChunk));
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('❌ Erreur d\'envoi (appel Expo) :', error);
      }
    }

    let succes = 0;
    const tokensAsupprimer: string[] = [];

    tickets.forEach((ticket, i) => {
      if (ticket.status === 'ok') {
        succes++;
        return;
      }

      // ticket.status === 'error'
      const destinataire = messages[i]?.to;
      console.error(
        `❌ Notification refusée par Expo pour le token ${destinataire} : ${ticket.details?.error || ticket.message}`
      );

      if (ticket.details?.error === 'DeviceNotRegistered' && typeof destinataire === 'string') {
        tokensAsupprimer.push(destinataire);
      }

      if (ticket.details?.error === 'InvalidCredentials') {
        console.error(
          '⚠️  InvalidCredentials : les identifiants push (Firebase FCM / Apple APNs) ne sont ' +
          'pas configurés côté EAS pour ce build. Vérifiez "eas credentials" — c\'est la cause ' +
          'la plus fréquente de notifications qui marchent en développement mais pas en production.'
        );
      }
    });

    if (tokensAsupprimer.length > 0) {
      await NotificationToken.destroy({ where: { token: tokensAsupprimer } });
      console.log(`🗑️  ${tokensAsupprimer.length} token(s) obsolète(s) supprimé(s)`);
    }

    console.log(`✅ ${succes}/${messages.length} notification(s) acceptée(s) par Expo`);
  }

  /**
   * 🔔 Envoyer une notification à un utilisateur spécifique
   */
  async sendToUser(userId: string, title: string, body: string, data: any = {}): Promise<void> {
    console.log(`🔔 [sendToUser] appelé — userId=${userId}, titre="${title}"`);
    try {
      const tokens = await NotificationToken.findAll({ where: { user_id: userId } });
      console.log(`🔔 [sendToUser] ${tokens.length} token(s) en base pour cet utilisateur`);

      if (tokens.length === 0) {
        console.log(`⚠️ Aucun token trouvé pour l'utilisateur ${userId} — il n'a probablement jamais accepté les notifications ou l'enregistrement du token a échoué côté app`);
        return;
      }

      const messages: ExpoPushMessage[] = tokens
        .filter(t => Expo.isExpoPushToken(t.token))
        .map(t => ({ to: t.token, sound: 'default', title, body, data }));

      const invalides = tokens.filter(t => !Expo.isExpoPushToken(t.token));
      if (invalides.length > 0) {
        console.log(`⚠️ ${invalides.length} token(s) mal formé(s) ignoré(s) : ${invalides.map(t => t.token).join(', ')}`);
      }

      if (messages.length === 0) {
        console.log(`⚠️ Aucun token Expo valide pour l'utilisateur ${userId}`);
        return;
      }

      await this.envoyerMessages(messages);
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
      const whereCondition: any = { actif: true };
      if (roles.length > 0) {
        whereCondition.role = roles;
      }

      const users = await User.findAll({ where: whereCondition, attributes: ['id'] });

      if (users.length === 0) {
        console.log('⚠️ Aucun utilisateur trouvé pour ce groupe');
        return;
      }

      const userIds = users.map(u => u.id);
      const tokens = await NotificationToken.findAll({ where: { user_id: userIds } });

      if (tokens.length === 0) {
        console.log('⚠️ Aucun token trouvé pour ce groupe');
        return;
      }

      const messages: ExpoPushMessage[] = tokens
        .filter(t => Expo.isExpoPushToken(t.token))
        .map(t => ({ to: t.token, sound: 'default', title, body, data }));

      if (messages.length === 0) {
        console.log('⚠️ Aucun token Expo valide pour ce groupe');
        return;
      }

      await this.envoyerMessages(messages);
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
        where: { user_id: userId, token }
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
