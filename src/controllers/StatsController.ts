import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { Op } from 'sequelize';
import { Database } from '../config/database';

export class StatsController extends BaseController {

  getClassement = async (req: Request, res: Response): Promise<void> => {
    try {
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const debutMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
      const finMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth(), 0);
      const sequelize = Database.getInstance();

      const [classementMois] = await sequelize.query(`
        SELECT u.id, u.nom,
          COUNT(o.id) as nb_commandes,
          COALESCE(SUM(o.quantite), 0) as produits_vendus,
          COALESCE(SUM(o.prix_unitaire_reel * o.quantite), 0) as total_ventes
        FROM users u
        LEFT JOIN orders o ON o.commercial_id = u.id 
          AND o.statut = 'livree_payee'
          AND o.date_statut_livree >= '${debutMois.toISOString().split('T')[0]}'
        WHERE u.role = 'commercial' AND u.actif = true
        GROUP BY u.id, u.nom
        ORDER BY nb_commandes DESC
      `);

      const [classementMoisPrecedent] = await sequelize.query(`
        SELECT u.id, u.nom,
          COUNT(o.id) as nb_commandes,
          COALESCE(SUM(o.quantite), 0) as produits_vendus,
          COALESCE(SUM(o.prix_unitaire_reel * o.quantite), 0) as total_ventes
        FROM users u
        LEFT JOIN orders o ON o.commercial_id = u.id 
          AND o.statut = 'livree_payee'
          AND o.date_statut_livree BETWEEN '${debutMoisPrecedent.toISOString().split('T')[0]}' AND '${finMoisPrecedent.toISOString().split('T')[0]}'
        WHERE u.role = 'commercial' AND u.actif = true
        GROUP BY u.id, u.nom
        ORDER BY nb_commandes DESC
      `);

      this.success(res, {
        mois: classementMois,
        moisPrecedent: classementMoisPrecedent,
      });
    } catch (err: any) {
      console.error('Erreur classement:', err.message);
      this.error(res, 'Erreur');
    }
  };

  getStatsCommercial = async (req: Request, res: Response): Promise<void> => {
    try {
      const { commercialId } = req.params;
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const debutMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
      const finMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth(), 0);
      const debut6Mois = new Date(maintenant.getFullYear(), maintenant.getMonth() - 6, 1);
      const sequelize = Database.getInstance();

      const getStats = async (debut: Date, fin: Date) => {
        const [rows] = await sequelize.query(`
          SELECT 
            COUNT(o.id) as nb_commandes,
            COALESCE(SUM(o.quantite), 0) as produits_vendus,
            COALESCE(SUM(o.prix_unitaire_reel * o.quantite), 0) as total_ventes,
            COUNT(CASE WHEN o.statut = 'recue' THEN 1 END) as en_attente,
            COUNT(CASE WHEN o.statut = 'annulee' THEN 1 END) as annulees
          FROM orders o
          WHERE o.commercial_id = '${commercialId}'
            AND o.date_creation BETWEEN '${debut.toISOString().split('T')[0]}' AND '${fin.toISOString().split('T')[0]}'
        `);
        return rows[0];
      };

      const [statsMois, statsMoisPrecedent, stats6Mois] = await Promise.all([
        getStats(debutMois, maintenant),
        getStats(debutMoisPrecedent, finMoisPrecedent),
        getStats(debut6Mois, maintenant),
      ]);

      const evolution = [];
      for (let i = 5; i >= 0; i--) {
        const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
        const fin = i === 0 ? maintenant : new Date(maintenant.getFullYear(), maintenant.getMonth() - i + 1, 0);
        const stats = await getStats(debut, fin);
        evolution.push({
          mois: debut.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }),
          nb_commandes: (stats as any)?.nb_commandes || 0,
          produits_vendus: (stats as any)?.produits_vendus || 0,
          total_ventes: (stats as any)?.total_ventes || 0,
        });
      }

      this.success(res, {
        mois: statsMois,
        moisPrecedent: statsMoisPrecedent,
        sixMois: stats6Mois,
        evolution,
      });
    } catch (err: any) {
      console.error('Erreur stats commercial:', err.message);
      this.error(res, 'Erreur');
    }
  };
}