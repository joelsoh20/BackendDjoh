import { DataTypes, Model } from 'sequelize';
import { Database } from '../config/database';
import bcrypt from 'bcryptjs';
import { Role, CommissionMode } from '../types';

const sequelize = Database.getInstance();

export class User extends Model {
  public id!: string;
  public nom!: string;
  public email!: string;
  public mot_de_passe!: string;
  public role!: Role;
  public commission_mode!: CommissionMode;
  public commission_defaut!: number;
  public actif!: boolean;
  public date_creation!: Date;

  async verifierMotDePasse(mdp: string): Promise<boolean> {
    return bcrypt.compare(mdp, this.mot_de_passe);
  }

  toJSON(): any {
    const values = { ...this.get() };
    delete values.mot_de_passe;
    return values;
  }
}

User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  nom: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  mot_de_passe: { type: DataTypes.STRING(255), allowNull: false },
  role: {
    type: DataTypes.ENUM('admin', 'manager', 'commercial'),
    defaultValue: 'commercial'
  },
  commission_mode: {
    type: DataTypes.ENUM('forfaitaire', 'par_produit'),
    defaultValue: 'forfaitaire'
  },
  commission_defaut: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1000.00
  },
  actif: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  sequelize,
  tableName: 'users',
  timestamps: true,
  createdAt: 'date_creation',
  updatedAt: 'date_modification',
 hooks: {
  beforeCreate: async (user: User) => {
    if (user.mot_de_passe) {
      user.mot_de_passe = await bcrypt.hash(user.mot_de_passe, 12);
    }
  },
  beforeUpdate: async (user: User) => {
    // Ne re-hasher que si le mot de passe a changé
    if (user.changed('mot_de_passe')) {
      user.mot_de_passe = await bcrypt.hash(user.mot_de_passe, 12);
    }
  }
}
});