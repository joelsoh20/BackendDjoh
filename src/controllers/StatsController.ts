import { Request, Response } from 'express';
import { BaseController } from './BaseController';
import { Database } from '../config/database';
import { QueryTypes } from 'sequelize';

export class StatsController extends BaseController {

  getClassement = async (req: Request, res: Response): Promise<void> => {
    try {
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
      const debutMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1);
      const finMoisPrecedent = new Date(maintenant.getFullYear(), maintenant.getMonth(), 0);
      const sequelize = Database.getInstance();

      // Important : les lignes de produits sont pré-agrégées par commande
      // AVANT d'être jointes aux commerciaux, sinon la commission (qui vit
      // sur la commande, pas sur chaque ligne) serait comptée une fois par
      // produit de la commande au lieu d'une seule fois.
      const requeteClassement = `
        SELECT u.id, u.nom,
          COUNT(c.id)::int as nb_commandes,
          COALESCE(SUM(cl.produits_vendus), 0)::int as produits_vendus,
          COALESCE(SUM(cl.total_ventes), 0)::decimal as total_ventes,
          COALESCE(SUM(c.commission_commercial), 0)::decimal as total_commissions
        FROM users u
        LEFT JOIN commandes c ON c.commercial_id = u.id
          AND c.statut = 'livree_payee'
          AND c.date_statut_livree BETWEEN :debut AND :fin
        LEFT JOIN (
          SELECT commande_id,
                 SUM(quantite) as produits_vendus,
                 SUM(prix_unitaire_reel * quantite) as total_ventes
          FROM commande_lignes
          GROUP BY commande_id
        ) cl ON cl.commande_id = c.id
        WHERE u.role = 'commercial' AND u.actif = true
        GROUP BY u.id, u.nom
        ORDER BY nb_commandes DESC, total_ventes DESC
      `;

      const finMois = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 0, 23, 59, 59);

      const classementMois = await sequelize.query(requeteClassement, {
        replacements: {
          debut: debutMois.toISOString().split('T')[0],
          fin: finMois.toISOString().split('T')[0]
        },
        type: QueryTypes.SELECT
      });

      console.log('[getClassement] mois:', JSON.stringify(classementMois));

      const classementMoisPrecedent = await sequelize.query(requeteClassement, {
        replacements: {
          debut: debutMoisPrecedent.toISOString().split('T')[0],
          fin: finMoisPrecedent.toISOString().split('T')[0]
        },
        type: QueryTypes.SELECT
      });

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
        // Deux notions de "période" bien distinctes :
        // - date_creation : activité du commercial (commandes soumises,
        //   en attente, annulées) — le compteur "nb_commandes" et les
        //   commandes en attente/annulées suivent la soumission.
        // - date_statut_livree : ventes et commissions réelles — une
        //   commande compte dans la compta du mois où elle a été LIVRÉE,
        //   peu importe quand elle a été soumise.
        // Même précaution que partout ailleurs : lignes pré-agrégées par
        // commande avant jointure, pour ne pas dupliquer commission_commercial.
        const rows = await sequelize.query(`
          SELECT
            COUNT(CASE WHEN c.date_creation BETWEEN :debut AND :fin THEN 1 END)::int as nb_commandes,
            COALESCE(SUM(CASE WHEN c.statut = 'livree_payee' AND c.date_statut_livree BETWEEN :debut AND :fin
              THEN cl.produits_vendus ELSE 0 END), 0)::int as produits_vendus,
            COALESCE(SUM(CASE WHEN c.statut = 'livree_payee' AND c.date_statut_livree BETWEEN :debut AND :fin
              THEN cl.total_ventes ELSE 0 END), 0)::decimal as total_ventes,
            COALESCE(SUM(CASE WHEN c.statut = 'livree_payee' AND c.date_statut_livree BETWEEN :debut AND :fin
              THEN c.commission_commercial ELSE 0 END), 0)::decimal as total_commissions,
            COUNT(CASE WHEN c.statut = 'recue' AND c.date_creation BETWEEN :debut AND :fin THEN 1 END)::int as en_attente,
            COUNT(CASE WHEN c.statut = 'annulee' AND c.date_creation BETWEEN :debut AND :fin THEN 1 END)::int as annulees
          FROM commandes c
          LEFT JOIN (
            SELECT commande_id,
                   SUM(quantite) as produits_vendus,
                   SUM(prix_unitaire_reel * quantite) as total_ventes
            FROM commande_lignes
            GROUP BY commande_id
          ) cl ON cl.commande_id = c.id
          WHERE c.commercial_id = :commercialId
            AND (c.date_creation BETWEEN :debut AND :fin OR c.date_statut_livree BETWEEN :debut AND :fin)
        `, {
          replacements: {
            commercialId,
            debut: debut.toISOString().split('T')[0],
            fin: fin.toISOString().split('T')[0]
          },
          type: QueryTypes.SELECT
        });
        return (rows as any[])[0];
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
          total_commissions: (stats as any)?.total_commissions || 0,
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
