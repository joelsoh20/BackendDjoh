import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';
import { ActionCommandesEnAttente } from '../types';

const sequelize = Database.getInstance();

export class MonthlyClosing extends Model {
  public id!: string;
  public mois!: number;
  public annee!: number;
  public ca_total!: number;
  public benefice_net_total!: number;
  public commissions_json!: any[];
  public commandes_en_attente_action!: ActionCommandesEnAttente;
  public pdf_export_url!: string | null;
  public cloture_par!: string;
  public date_cloture!: Date;
}

MonthlyClosing.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  mois: { type: DataTypes.INTEGER, allowNull: false },
  annee: { type: DataTypes.INTEGER, allowNull: false },
  ca_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  benefice_net_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  commissions_json: { type: DataTypes.JSONB, allowNull: false },
  commandes_en_attente_action: {
    type: DataTypes.ENUM('annulees', 'reportees'),
    defaultValue: 'reportees'
  },
  pdf_export_url: { type: DataTypes.STRING(500), allowNull: true },
  cloture_par: { type: DataTypes.UUID, allowNull: false },
  date_cloture: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  sequelize,
  tableName: 'monthly_closings',
  timestamps: true,
  createdAt: 'date_cloture',
  updatedAt: false
});