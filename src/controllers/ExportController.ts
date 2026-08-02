import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ExportService } from '../services/ExportService';

export class ExportController extends BaseController {
  private exportService: ExportService;

  constructor() {
    super();
    this.exportService = new ExportService();
  }

  exportFEC = async (req: Request, res: Response): Promise<void> => {
    try {
      const relativeUrl = await this.exportService.generateFEC();
      this.success(res, { url: `${req.protocol}://${req.get('host')}${relativeUrl}` });
    } catch (err) {
      this.error(res, 'Erreur lors de l\'export FEC');
    }
  };

  exportPDF = async (req: Request, res: Response): Promise<void> => {
    try {
      const { mois, annee } = req.query;
      const relativeUrl = await this.exportService.generatePDF(
        mois ? parseInt(mois as string) : undefined,
        annee ? parseInt(annee as string) : undefined
      );
      this.success(res, { url: `${req.protocol}://${req.get('host')}${relativeUrl}` });
    } catch (err) {
      this.error(res, 'Erreur lors de l\'export PDF');
    }
  };

  exportBalance = async (req: Request, res: Response): Promise<void> => {
    try {
      const relativeUrl = await this.exportService.generateBalance();
      this.success(res, { url: `${req.protocol}://${req.get('host')}${relativeUrl}` });
    } catch (err) {
      this.error(res, 'Erreur lors de l\'export Balance');
    }
  };
}