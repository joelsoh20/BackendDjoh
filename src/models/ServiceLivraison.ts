import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

export class ServiceLivraison extends Model {
  public id!: string;
  public nom!: string;
  public contact!: string | null;
  public zone!: string | null;
  public actif!: boolean;
}

ServiceLivraison.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  nom: { type: DataTypes.STRING(200), allowNull: false },
  contact: { type: DataTypes.STRING(20), allowNull: true },
  zone: { type: DataTypes.STRING(200), allowNull: true },
  actif: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  sequelize,
  tableName: 'services_livraison',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification'
});