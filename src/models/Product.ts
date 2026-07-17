import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class Product extends Model {
  public id!: string;
  public nom!: string;
  public prix_catalogue!: number;
  public cout_revient!: number;
  public actif!: boolean;
}

Product.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  nom: { type: DataTypes.STRING(200), allowNull: false },
  prix_catalogue: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  cout_revient: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  actif: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  sequelize,
  tableName: 'products',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification'
});
