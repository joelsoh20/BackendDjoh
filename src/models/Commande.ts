import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';
import { StatutCommande } from '../types';

const sequelize = Database.getInstance();

/**
 * En-tête d'une commande client. Une commande peut contenir plusieurs
 * produits (voir CommandeLigne) mais n'a qu'UN SEUL statut, UN SEUL
 * frais de livraison, UNE SEULE commission commerciale et UN SEUL
 * service de livraison — ces informations ne sont plus dupliquées
 * par produit comme c'était le cas avant (ancien modèle Order + group_id).
 */
export class Commande extends Model {
  public id!: string;
  public client_nom!: string;
  public client_telephone!: string | null;
  public client_quartier!: string | null;
  public commercial_id!: string;
  public deliverer_id!: string | null;
  public frais_livraison!: number;
  public statut!: StatutCommande;
  public commission_commercial!: number;
  public prix_total!: number;
  public date_statut_livree!: Date | null;
  public cloture_id!: string | null;
  public service_livraison_id!: string | null;
  public motif_annulation!: string | null;
}

Commande.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  client_nom: { type: DataTypes.STRING(200), allowNull: false },
  client_telephone: { type: DataTypes.STRING(20), allowNull: true },
  client_quartier: { type: DataTypes.STRING(200), allowNull: true },
  commercial_id: { type: DataTypes.UUID, allowNull: false },
  deliverer_id: { type: DataTypes.UUID, allowNull: true },
  frais_livraison: { type: DataTypes.DECIMAL(10, 2), defaultValue: 1000.00 },
  service_livraison_id: { type: DataTypes.UUID, allowNull: true },
  motif_annulation: { type: DataTypes.TEXT, allowNull: true },
  statut: {
    type: DataTypes.ENUM('recue', 'validee', 'livree_payee', 'annulee'),
    defaultValue: 'recue'
  },
  commission_commercial: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  prix_total: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  date_statut_livree: { type: DataTypes.DATE, allowNull: true },
  cloture_id: { type: DataTypes.UUID, allowNull: true }
}, {
  sequelize,
  tableName: 'commandes',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification'
});
