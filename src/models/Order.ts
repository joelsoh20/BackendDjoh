import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';
import { StatutCommande } from '../types';

const sequelize = Database.getInstance();

export class Order extends Model {
  public id!: string;
  public client_nom!: string;
  public client_telephone!: string | null;
  public client_quartier!: string | null;
  public product_id!: string;
  public quantite!: number;
  public prix_unitaire_reel!: number;
  public commercial_id!: string;
  public deliverer_id!: string | null;
  public frais_livraison!: number;
  public statut!: StatutCommande;
  public commission_commercial!: number;
  public date_statut_livree!: Date | null;
  public cloture_id!: string | null;
  public group_id!: string | null;
  public service_livraison_id!: string | null;
  public motif_annulation!: string | null;
}

Order.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  client_nom: { type: DataTypes.STRING(200), allowNull: false },
  client_telephone: { type: DataTypes.STRING(20), allowNull: true },
  client_quartier: { type: DataTypes.STRING(200), allowNull: true },
  product_id: { type: DataTypes.UUID, allowNull: false },
  quantite: { type: DataTypes.INTEGER, defaultValue: 1 },
  prix_unitaire_reel: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  commercial_id: { type: DataTypes.UUID, allowNull: false },
  deliverer_id: { type: DataTypes.UUID, allowNull: true },
  frais_livraison: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1000.00 },
  service_livraison_id: { type: DataTypes.UUID, allowNull: true },
  group_id: { type: DataTypes.UUID, allowNull: true },
  motif_annulation: { type: DataTypes.TEXT, allowNull: true },
  statut: {
    type: DataTypes.ENUM('recue', 'livree_payee', 'annulee'),
    defaultValue: 'recue'
  },
  commission_commercial: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  date_statut_livree: { type: DataTypes.DATE, allowNull: true },
  cloture_id: { type: DataTypes.UUID, allowNull: true }
}, {
  sequelize,
  tableName: 'orders',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification'
});