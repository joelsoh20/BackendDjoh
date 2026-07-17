import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class NotificationToken extends Model {
  public id!: string;
  public user_id!: string;
  public token!: string;
}

NotificationToken.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  token: { type: DataTypes.STRING, allowNull: false },
}, {
  sequelize,
  tableName: 'notification_tokens',
  timestamps: true,
  createdAt: 'date_creation',
});