import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';
import { Database } from './config/database';
import { setupAssociations } from './config/associations';
import routes from './routes';

dotenv.config();

export class App {
  private app: express.Application;

  constructor() {
    this.app = express();
    this.app.set('trust proxy', 1);
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandler();
    
  }

  private setupMiddlewares(): void {
  // 1. Sécurité et logs (ordre moins important)
  this.app.use(helmet());
  // Les applications mobiles React Native n'appliquent PAS le CORS : c'est
  // pourquoi cette liste n'a jamais posé problème jusqu'ici. Le navigateur,
  // lui, l'applique strictement — l'origine de la PWA DOIT y figurer, sinon
  // toutes les requêtes sont bloquées.
  //
  // Renseignez CORS_ORIGINS dans le .env (domaines séparés par des virgules),
  // ex : CORS_ORIGINS=https://ndjoh.netlify.app,https://www.ndjoh.cm
  const originesEnv = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

  const originesAutorisees = [
    'http://localhost:3000',   // test local de la PWA (npm run serve:web)
    'http://localhost:5173',
    'http://localhost:8081',   // expo start --web
    'http://localhost:19006',
    ...originesEnv,
  ];

  this.app.use(cors({
    origin: (origin, callback) => {
      // Pas d'origine = appel mobile natif, Postman, curl... : autorisé.
      if (!origin) return callback(null, true);
      if (originesAutorisees.includes(origin)) return callback(null, true);
      console.warn(`⛔ CORS refusé pour l'origine : ${origin} (ajoutez-la dans CORS_ORIGINS)`);
      return callback(new Error('Origine non autorisée par CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  this.app.use(morgan('dev'));
  
  // 2. IMPORTANT : Parseur JSON AVANT les routes
  this.app.use(express.json());
  this.app.use(express.urlencoded({ extended: true }));

  // 3. Fichiers exportés (FEC/PDF/Balance) téléchargeables directement
  this.app.use('/exports', express.static(path.join(__dirname, '../exports')));
}

  private setupRoutes(): void {
  console.log('🔍 Montage des routes /api...');
  this.app.use('/api', routes);
  console.log('✅ Routes /api montées');
  
  this.app.get('/', (req, res) => {
    res.json({ message: 'API Compta Social Commerce', version: '2.2.1' });
  });
}

  private setupErrorHandler(): void {
    this.app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('ERREUR GLOBALE:', err.message, err.stack);
      res.status(500).json({ success: false, message: 'Erreur serveur' });
    });
  }

  async start(): Promise<void> {
    await Database.connect();
    setupAssociations();
    await Database.getInstance().sync();
    
    const port = process.env.PORT || 5000;
    this.app.listen(port, () => {
      console.log(`🚀 Serveur démarré sur le port ${port}`);
    });
  }
}

const app = new App();
app.start();