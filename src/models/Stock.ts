import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class Stock extends Model {
  public id!: string;
  public product_id!: string;
  public quantite!: number;
  public date_modification!: Date;
}

Stock.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id: { type: DataTypes.UUID, allowNull: false, unique: true },
  quantite: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
},{
  sequelize,
  tableName: 'stocks',
  timestamps: true,           // ← doit être true
  createdAt: 'date_creation',
  updatedAt: 'date_modification'  // ← ajoute cette ligne
});