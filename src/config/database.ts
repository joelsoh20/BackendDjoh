import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

export class Database {
  private static instance: Sequelize;

  static getInstance(): Sequelize {
    if (!Database.instance) {
      Database.instance = new Sequelize(
        process.env.DB_NAME!,
        process.env.DB_USER!,
        process.env.DB_PASSWORD!,
        {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          dialect: 'postgres',
          logging: false,
          pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
        }
      );
    }
    return Database.instance;
  }

  static async connect(): Promise<void> {
    try {
      await Database.getInstance().authenticate();
      console.log('✅ Base de données connectée');
    } catch (error) {
      console.error('❌ Erreur connexion DB:', error);
      process.exit(1);
    }
  }
}