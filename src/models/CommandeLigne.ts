import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

/**
 * Une ligne de produit au sein d'une commande (Commande). Ne contient
 * que ce qui varie réellement par produit : le produit, la quantité et
 * le prix unitaire réel de vente.
 */
export class CommandeLigne extends Model {
  public id!: string;
  public commande_id!: string;
  public product_id!: string;
  public quantite!: number;
  public prix_unitaire_reel!: number;
}

CommandeLigne.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  commande_id: { type: DataTypes.UUID, allowNull: false },
  product_id: { type: DataTypes.UUID, allowNull: false },
  quantite: { type: DataTypes.INTEGER, defaultValue: 1 },
  prix_unitaire_reel: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
}, {
  sequelize,
  tableName: 'commande_lignes',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: false
});
