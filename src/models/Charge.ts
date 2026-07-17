import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class Charge extends Model {
  public id!: string;
  public date!: string;
  public type!: string;
  public montant!: number;
  public description!: string | null;
  public commercial_id!: string | null;
}

Charge.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  type: { type: DataTypes.STRING(100), allowNull: false },
  montant: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  commercial_id: { type: DataTypes.UUID, allowNull: true }
}, {
  sequelize,
  tableName: 'charges',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification'
});