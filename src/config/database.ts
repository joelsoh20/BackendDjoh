import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

export class Database {
  private static instance: Sequelize;

  static getInstance(): Sequelize {
    if (!Database.instance) {
      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        throw new Error('❌ La variable DATABASE_URL est introuvable.');
      }

      Database.instance = new Sequelize(databaseUrl, {
        dialect: 'postgres',
        logging: false,

        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000,
        },

        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        },

        define: {
          timestamps: true,
          freezeTableName: true,
        },
      });
    }

    return Database.instance;
  }

  static async connect(): Promise<void> {
    try {
      await Database.getInstance().authenticate();
      console.log('✅ Base de données connectée (Supabase)');
    } catch (error) {
      console.error('❌ Erreur de connexion à Supabase :', error);
      process.exit(1);
    }
  }
}

