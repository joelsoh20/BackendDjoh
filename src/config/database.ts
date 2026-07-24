import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

export class Database {
  private static instance: Sequelize;

  static getInstance(): Sequelize {
    if (!Database.instance) {
      // Log pour vérifier l'URL
      //console.log('🔍 DATABASE_URL:', process.env.DATABASE_URL);
      
      Database.instance = new Sequelize(process.env.DATABASE_URL!, {
        dialect: 'postgres',
        logging: false,
        pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      });
    }
    return Database.instance;
  }

  static async connect(): Promise<void> {
    try {
      await Database.getInstance().authenticate();
      console.log('✅ Base de données connectée (Supabase)');
    } catch (error) {
      console.error('❌ Erreur connexion DB:', error);
      process.exit(1);
    }
  }
}