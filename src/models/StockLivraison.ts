import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class StockLivraison extends Model {
  public id!: string;
  public service_id!: string;
  public product_id!: string;
  public quantite!: number;
}

StockLivraison.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  service_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  quantite: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  sequelize,
  tableName: 'stocks_livraison',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification',
  indexes: [{ unique: true, fields: ['service_id', 'product_id'] }]
});