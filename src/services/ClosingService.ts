import { Database } from '../config/database';
import { Order } from '../models/Order';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { MonthlyClosing } from '../models/MonthlyClosing';
import { Charge } from '../models/Charge';
import { Op } from 'sequelize';
import { ActionCommandesEnAttente } from '../types';

export class ClosingService {

  async cloturerMois(
    mois: number,
    annee: number,
    commandesEnAttenteAction: ActionCommandesEnAttente,
    adminId: string
  ): Promise<any> {
    const sequelize = Database.getInstance();
    const transaction = await sequelize.transaction();

    try {
      // 1. Vérifier l'ordre chronologique
      const cloturePosterieure = await MonthlyClosing.findOne({
        where: {
          [Op.or]: [
            { annee: { [Op.gt]: annee } },
            { annee, mois: { [Op.gt]: mois } }
          ]
        },
        transaction
      });

      if (cloturePosterieure) {
        throw new Error('Un mois postérieur est déjà clôturé. Respectez l\'ordre chronologique.');
      }

      // Vérifier si déjà clôturé
      const dejaCloture = await MonthlyClosing.findOne({
        where: { mois, annee },
        transaction
      });

      if (dejaCloture) {
        throw new Error(`Le mois ${mois}/${annee} est déjà clôturé.`);
      }

      // Dates
      const debutMois = new Date(annee, mois - 1, 1);
      const finMois = new Date(annee, mois, 0, 23, 59, 59);

      // 2. Commandes livree_payee du mois
      const commandesLivrees = await Order.findAll({
        where: {
          statut: 'livree_payee',
          date_statut_livree: { [Op.between]: [debutMois, finMois] },
          cloture_id: null
        },
        include: [
          { model: Product, as: 'produit' },
          { model: User, as: 'commercial', attributes: { exclude: ['mot_de_passe'] } }
        ],
        transaction
      });

      // 3. Commandes recue en attente
      const commandesEnAttente = await Order.findAll({
        where: {
          statut: 'recue',
          date_creation: { [Op.between]: [debutMois, finMois] },
          cloture_id: null
        },
        transaction
      });

      if (commandesEnAttenteAction === 'annulees') {
        await Order.update(
          { statut: 'annulee' },
          { where: { id: commandesEnAttente.map(c => c.id) }, transaction }
        );
      }

      // 4. Calculer les totaux
      let caTotal = 0;
      let beneficeNetTotal = 0;
      const commissionsParCommercial: Record<string, any> = {};

      for (const order of commandesLivrees) {
        const ca = Number(order.prix_unitaire_reel) * order.quantite;
        caTotal += ca;

        const produit = (order as any).produit;
        const coutRevient = produit ? Number(produit.cout_revient) * order.quantite : 0;
        const frais = Number(order.frais_livraison);
        const commission = Number(order.commission_commercial);

        beneficeNetTotal += ca - coutRevient - frais - commission;

        const commercial = (order as any).commercial;
        if (commercial) {
          if (!commissionsParCommercial[commercial.id]) {
            commissionsParCommercial[commercial.id] = {
              commercial_id: commercial.id,
              nom: commercial.nom,
              produits_vendus: 0,
              montant_du: 0
            };
          }
          commissionsParCommercial[commercial.id].produits_vendus += order.quantite;
          commissionsParCommercial[commercial.id].montant_du += commission;
        }
      }

      // 5. Déduire les charges
      const charges = await Charge.findAll({
        where: {
          date: { [Op.between]: [debutMois.toISOString().split('T')[0], finMois.toISOString().split('T')[0]] }
        },
        transaction
      });

      const totalCharges = charges.reduce((sum, c) => sum + Number(c.montant), 0);
      beneficeNetTotal -= totalCharges;

      // 6. Créer MonthlyClosing
      const closing = await MonthlyClosing.create({
        mois,
        annee,
        ca_total: Math.round(caTotal),
        benefice_net_total: Math.round(beneficeNetTotal),
        commissions_json: Object.values(commissionsParCommercial),
        commandes_en_attente_action: commandesEnAttenteAction,
        cloture_par: adminId
      }, { transaction });

      // 7. Assigner cloture_id aux commandes
      const toutesLesIds = [
        ...commandesLivrees.map(c => c.id),
        ...commandesEnAttente.map(c => c.id)
      ];

      await Order.update(
        { cloture_id: closing.id },
        { where: { id: toutesLesIds }, transaction }
      );

      await transaction.commit();

      return {
        success: true,
        data: {
          closing,
          commandesLivrees: commandesLivrees.length,
          commandesEnAttente: commandesEnAttente.length
        }
      };

    } catch (error: any) {
      await transaction.rollback();
      throw error;
    }
  }

  async getAll(): Promise<MonthlyClosing[]> {
    return MonthlyClosing.findAll({
      include: [{ model: User, as: 'cloturePar', attributes: ['id', 'nom'] }],
      order: [['annee', 'DESC'], ['mois', 'DESC']]
    });
  }
}