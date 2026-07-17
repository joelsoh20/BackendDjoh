import { Expo } from 'expo-server-sdk';
import { NotificationToken } from '../models/NotificationToken';

const expo = new Expo();

export class NotificationService {
  async sendToUser(userId: string, title: string, body: string, data?: any) {
    const tokens = await NotificationToken.findAll({ where: { user_id: userId } });
    const messages = [];

    for (const t of tokens) {
      if (!Expo.isExpoPushToken(t.token)) continue;
      messages.push({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data || {},
      });
    }

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  }

  async sendToAll(title: string, body: string, data?: any) {
    const tokens = await NotificationToken.findAll();
    const messages = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        sound: 'default',
        title,
        body,
        data: data || {},
      }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  }
}