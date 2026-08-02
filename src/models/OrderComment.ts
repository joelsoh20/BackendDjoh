import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class OrderComment extends Model {
  public id!: string;
  public commande_id!: string;
  public user_id!: string;
  public message!: string;
  public date_creation!: Date;
}

OrderComment.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  commande_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
}, {
  sequelize,
  tableName: 'order_comments',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: false,
});
