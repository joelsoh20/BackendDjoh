import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

/**
 * Trace chaque ajout au stock principal : qui l'a fait, quand, et combien.
 * Permet à un manager de corriger sa propre saisie dans l'heure qui suit,
 * et bloque toute modification passé ce délai (sécurité contre une
 * correction tardive non tracée).
 */
export class StockMouvement extends Model {
  public id!: string;
  public product_id!: string;
  public user_id!: string;
  public quantite!: number;
  public date_creation!: Date;
}

StockMouvement.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  product_id: { type: DataTypes.UUID, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  quantite: { type: DataTypes.INTEGER, allowNull: false },
}, {
  sequelize,
  tableName: 'stock_mouvements',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: false,
});
