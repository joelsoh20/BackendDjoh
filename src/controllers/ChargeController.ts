import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ChargeRepository } from '../repositories/ChargeRepository';
import { Commande } from '../models/Commande';
import { User } from '../models/User';
import { MonthlyClosing } from '../models/MonthlyClosing';
import { Op } from 'sequelize';

export class ChargeController extends BaseController {
  private chargeRepo: ChargeRepository;

  constructor() {
    super();
    this.chargeRepo = new ChargeRepository();
  }

  getAll = async (req: Request, res: Response): Promise<void> => {
    try {
      const charges = await this.chargeRepo.findAll({
        include: ['commercial'],
        order: [['date', 'DESC']]
      });
      this.success(res, charges);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    try {
      const charge = await this.chargeRepo.findById(req.params.id as string);
      if (!charge) return this.notFound(res, 'Charge non trouvée');
      this.success(res, charge);
    } catch (err) {
      this.error(res, 'Erreur lors de la récupération');
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    try {
      const { date, type, montant, description, commercial_id } = req.body;
      if (!type || !montant) {
        return this.badRequest(res, 'Type et montant requis');
      }
      const charge = await this.chargeRepo.create({ date, type, montant, description, commercial_id });
      this.created(res, charge);
    } catch (err) {
      this.error(res, 'Erreur lors de la création');
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const charge = await this.chargeRepo.findById(id as string);
      if (!charge) return this.notFound(res, 'Charge non trouvée');

      await this.chargeRepo.update(id as string, req.body);
      const updated = await this.chargeRepo.findById(id as string);
      this.success(res, updated);
    } catch (err) {
      this.error(res, 'Erreur lors de la modification');
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const charge = await this.chargeRepo.findById(id as string);
      if (!charge) return this.notFound(res, 'Charge non trouvée');

      await this.chargeRepo.delete(id as string);
      this.success(res, null, 'Charge supprimée');
    } catch (err) {
      this.error(res, 'Erreur lors de la suppression');
    }
  };

  /**
   * Résumé comptable du mois en cours : commissions dues par commercial,
   * total des frais de livraison, et historique des 12 dernières clôtures.
   * (Auparavant cassé : les requêtes SQL avaient été remplacées par des
   * placeholders '...' oubliés, la route était même court-circuitée.)
   */
  getResumeMensuel = async (req: Request, res: Response): Promise<void> => {
    try {
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0, 23, 59, 59);

      const commandesLivrees = await Commande.findAll({
        where: {
          statut: 'livree_payee',
          date_statut_livree: { [Op.between]: [debutMois, finMois] }
        },
        include: [{ model: User, as: 'commercial', attributes: ['id', 'nom'] }]
      });

      const commissionsParCommercial: Record<string, { nom: string; montant: number }> = {};
      let totalLivraisonMois = 0;

      for (const commande of commandesLivrees) {
        totalLivraisonMois += Number(commande.frais_livraison);
        const commercial = (commande as any).commercial;
        if (!commercial) continue;

        if (!commissionsParCommercial[commercial.id]) {
          commissionsParCommercial[commercial.id] = { nom: commercial.nom, montant: 0 };
        }
        commissionsParCommercial[commercial.id].montant += Number(commande.commission_commercial);
      }

      const commissionsMois = Object.values(commissionsParCommercial).sort((a, b) => b.montant - a.montant);
      const totalCommissionsMois = commissionsMois.reduce((sum, c) => sum + c.montant, 0);

      const historique = await MonthlyClosing.findAll({
        order: [['annee', 'DESC'], ['mois', 'DESC']],
        limit: 12
      });

      const historiquePaiements = historique.map(h => {
        const commissionsJson = (h.commissions_json || []) as any[];
        return {
          mois: h.mois,
          annee: h.annee,
          totalCommissions: commissionsJson.reduce((s: number, c: any) => s + (Number(c.montant_du) || 0), 0),
          commissions: commissionsJson.map((c: any) => ({ nom: c.nom, montant_du: c.montant_du }))
        };
      });

      this.success(res, {
        commissionsMois,
        totalCommissionsMois: Math.round(totalCommissionsMois),
        totalLivraisonMois: Math.round(totalLivraisonMois),
        historiquePaiements
      });
    } catch (err: any) {
      console.error('Erreur résumé mensuel:', err.message);
      this.error(res, 'Erreur lors de la récupération du résumé mensuel');
    }
  };
}
