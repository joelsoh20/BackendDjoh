
import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ClosingService } from '../services/ClosingService';

export class ClosingController extends BaseController {
  private closingService: ClosingService;

  constructor() {
    super();
    this.closingService = new ClosingService();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const closings = await this.closingService.getAll();
      this.success(res, closings);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  cloturer = async (req: Request, res: Response): Promise<void> => {
    try {
      const { mois, annee, commandes_en_attente_action } = req.body;
      const adminId = (req as any).utilisateur.id;

      if (!mois || !annee || !commandes_en_attente_action) {
        return this.badRequest(res, 'Mois, année et action requis');
      }

      const result = await this.closingService.cloturerMois(
        mois, annee, commandes_en_attente_action, adminId
      );

      this.created(res, result.data);
    } catch (err: any) {
      this.badRequest(res, err.message);
    }
  };
}