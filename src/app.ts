import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { Database } from './config/database';
import { setupAssociations } from './config/associations';
import routes from './routes';

dotenv.config();

export class App {
  private app: express.Application;

  constructor() {
    this.app = express();
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandler();
    
  }

  private setupMiddlewares(): void {
  this.app.use(helmet());
  this.app.use(cors({
  origin: [
    'http://localhost:5173',      // Vite en développement
    'http://localhost:8081',      // Si tu utilises un autre serveur web
    'https://ton-site.netlify.app', // Frontend web en production
    'https://ton-site.vercel.app',  // Si tu utilises Vercel
    'exp://*'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
  this.app.use(morgan('dev'));
  this.app.use(express.json());
}

  private setupRoutes(): void {
    this.app.get('/test', (req, res) => {
    console.log('Test OK');
    res.json({ message: 'test ok' });
    });
    this.app.use('/api', routes);
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