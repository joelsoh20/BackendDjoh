import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { ChargeRepository } from '../repositories/ChargeRepository';
import { Database } from '../config/database';
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

 getResumeMensuel = async (req: Request, res: Response): Promise<void> => {
  try {
    const sequelize = Database.getInstance();
    const maintenant = new Date();
    const debut = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-01`;
    const fin = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-31`;

    const [commissions] = await sequelize.query(`...`);
    const [livraison] = await sequelize.query(`...`);
    const [historique] = await sequelize.query(`...`);

    this.success(res, {
      commissionsMois: commissions || [],
      totalCommissionsMois: (commissions as any[] || []).reduce((sum, c: any) => sum + (Number(c.montant) || 0), 0),
      totalLivraisonMois: Number((livraison as any[])?.[0]?.total) || 0,
      historiquePaiements: (historique as any[] || []).map((h: any) => ({
        mois: h.mois,
        annee: h.annee,
        totalCommissions: (h.commissions_json || []).reduce((s: number, c: any) => s + (Number(c.montant_du) || 0), 0),
        commissions: h.commissions_json || []
      }))
    });
  } catch (err: any) {
    console.error('ERREUR RÉSUMÉ:', err.message);
    this.error(res, 'Erreur');
  }
};
}

// import { Request, Response } from 'express';
// import { BaseController } from './BaseController';
// import { ChargeRepository } from '../repositories/ChargeRepository';
// import { Op } from 'sequelize';
// import { Database } from '../config/database';

// export class ChargeController extends BaseController {
//   private chargeRepo: ChargeRepository;

//   constructor() {
//     super();
//     this.chargeRepo = new ChargeRepository();
//   }
// getAll = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const charges = await this.chargeRepo.findAll({
//         include: ['commercial'],
//         order: [['date', 'DESC']]
//       });
//       this.success(res, charges);
//     } catch (err) {
//       this.error(res, 'Erreur lors de la récupération');
//     }
//   };

//   getById = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const charge = await this.chargeRepo.findById(req.params.id as string);
//       if (!charge) return this.notFound(res, 'Charge non trouvée');
//       this.success(res, charge);
//     } catch (err) {
//       this.error(res, 'Erreur lors de la récupération');
//     }
//   };

//   create = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const { date, type, montant, description, commercial_id } = req.body;
//       if (!type || !montant) {
//         return this.badRequest(res, 'Type et montant requis');
//       }
//       const charge = await this.chargeRepo.create({ date, type, montant, description, commercial_id });
//       this.created(res, charge);
//     } catch (err) {
//       this.error(res, 'Erreur lors de la création');
//     }
//   };

//   update = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const { id } = req.params;
//       const charge = await this.chargeRepo.findById(id as string);
//       if (!charge) return this.notFound(res, 'Charge non trouvée');

//       await this.chargeRepo.update(id as string, req.body);
//       const updated = await this.chargeRepo.findById(id as string);
//       this.success(res, updated);
//     } catch (err) {
//       this.error(res, 'Erreur lors de la modification');
//     }
//   };

//   delete = async (req: Request, res: Response): Promise<void> => {
//     try {
//       const { id } = req.params;
//       const charge = await this.chargeRepo.findById(id as string);
//       if (!charge) return this.notFound(res, 'Charge non trouvée');

//       await this.chargeRepo.delete(id as string);
//       this.success(res, null, 'Charge supprimée');
//     } catch (err) {
//       this.error(res, 'Erreur lors de la suppression');
//     }
//   };


//   getResumeMensuel = async (req: Request, res: Response): Promise<void> => {
//   try {
//     console.log('1. Début resume');
//     const sequelize = Database.getInstance();
//     const maintenant = new Date();
//     const debut = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-01`;
//     const fin = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-31`;
//     console.log('2. Dates:', debut, fin);

//     console.log('3. Requête commissions...');
//     const [commissions] = await sequelize.query(`
//       SELECT u.id, u.nom, SUM(o.commission_commercial) as montant
//       FROM orders o
//       JOIN users u ON u.id = o.commercial_id
//       WHERE o.statut = 'livree_payee'
//         AND o.date_statut_livree BETWEEN '${debut}' AND '${fin}'
//       GROUP BY u.id, u.nom
//       ORDER BY montant DESC
//     `);
//     console.log('4. Commissions OK:', (commissions as any[]).length);

//     console.log('5. Requête livraison...');
//     const [livraison] = await sequelize.query(`
//       SELECT COALESCE(SUM(frais_livraison), 0) as total
//       FROM orders
//       WHERE statut = 'livree_payee'
//         AND date_statut_livree BETWEEN '${debut}' AND '${fin}'
//     `);
//     console.log('6. Livraison OK');

//     console.log('7. Requête historique...');
//     const [historique] = await sequelize.query(`
//       SELECT mois, annee, commissions_json
//       FROM monthly_closings
//       ORDER BY annee DESC, mois DESC
//       LIMIT 12
//     `);
//     console.log('8. Historique OK');

//     this.success(res, {
//       commissionsMois: commissions as any[],
//       totalCommissionsMois: (commissions as any[]).reduce((sum, c) => sum + Number(c.montant), 0),
//       totalLivraisonMois: Number((livraison as any[])[0]?.total || 0),
//       historiquePaiements: (historique as any[]).map(h => ({
//         mois: h.mois,
//         annee: h.annee,
//         totalCommissions: (h.commissions_json || []).reduce((s, c) => s + (c.montant_du || 0), 0),
//         commissions: h.commissions_json || []
//       }))
//     });

//   } catch (err: any) {
//     console.error('💥 ERREUR RÉSUMÉ:', err.message);
//     console.error('💥 STACK:', err.stack);
//     this.error(res, 'Erreur lors de la récupération');
//   }
// };
// }