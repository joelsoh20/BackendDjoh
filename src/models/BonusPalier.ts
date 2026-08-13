import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';

const sequelize = Database.getInstance();

/**
 * Palier de bonus mensuel d'un commercial : "à partir de N commandes dans
 * le mois, bonus de M FCFA". Un commercial peut avoir plusieurs paliers ;
 * le bonus effectivement dû est celui du palier le plus haut atteint (pas
 * cumulé — voir BonusService.calculerBonus).
 */
export class BonusPalier extends Model {
  public id!: string;
  public user_id!: string;
  public nombre_commandes!: number;
  public montant!: number;
}

BonusPalier.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  nombre_commandes: { type: DataTypes.INTEGER, allowNull: false },
  montant: { type: DataTypes.DECIMAL(10, 2), allowNull: false }
}, {
  sequelize,
  tableName: 'bonus_paliers',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification',
  indexes: [{ unique: true, fields: ['user_id', 'nombre_commandes'] }]
});
