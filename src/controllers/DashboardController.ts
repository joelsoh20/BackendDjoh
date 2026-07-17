import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { DashboardService } from '../services/DashboardService';

export class DashboardController extends BaseController {
  private dashboardService: DashboardService;

  constructor() {
    super();
    this.dashboardService = new DashboardService();
  }  

  getDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
      const data = await this.dashboardService.getDashboard();
      this.success(res, data);
    } catch (err: any) {
      // Log détaillé
      console.error('=== ERREUR DASHBOARD ===');
      console.error('Message:', err.message);
      console.error('Stack:', err.stack);
      if (err.original) console.error('Original:', err.original);
      this.error(res, 'Erreur lors de la récupération du tableau de bord');
    }
  };
}