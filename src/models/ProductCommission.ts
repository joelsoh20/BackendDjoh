import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class ProductCommission extends Model {
  public id!: string;
  public user_id!: string;
  public product_id!: string;
  public montant!: number;
}

ProductCommission.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  montant: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
}, {
  sequelize,
  tableName: 'product_commissions',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification',
  indexes: [{ unique: true, fields: ['user_id', 'product_id'] }]
});