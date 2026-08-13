import { Database } from '../config/database';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { MonthlyClosing } from '../models/MonthlyClosing';
import { Charge } from '../models/Charge';
import { Op } from 'sequelize';
import { ActionCommandesEnAttente } from '../types';
import { BonusService } from './BonusService';

export class ClosingService {
  private bonusService = new BonusService();

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
      const commandesLivrees = await Commande.findAll({
        where: {
          statut: 'livree_payee',
          date_statut_livree: { [Op.between]: [debutMois, finMois] },
          cloture_id: null
        },
        include: [
          { model: CommandeLigne, as: 'lignes', include: [{ model: Product, as: 'produit' }] },
          { model: User, as: 'commercial', attributes: { exclude: ['mot_de_passe'] } }
        ],
        transaction
      });

      // 3. Commandes recue en attente
      const commandesEnAttente = await Commande.findAll({
        where: {
          statut: 'recue',
          date_creation: { [Op.between]: [debutMois, finMois] },
          cloture_id: null
        },
        transaction
      });

      if (commandesEnAttenteAction === 'annulees') {
        await Commande.update(
          { statut: 'annulee' },
          { where: { id: commandesEnAttente.map(c => c.id) }, transaction }
        );
      }

      // 4. Calculer les totaux
      let caTotal = 0;
      let beneficeNetTotal = 0;
      const commissionsParCommercial: Record<string, any> = {};

      for (const commande of commandesLivrees) {
        const lignes = (commande as any).lignes as any[];
        let caCommande = 0;
        let coutRevientCommande = 0;
        let produitsVendusCommande = 0;

        for (const ligne of lignes || []) {
          const ca = Number(ligne.prix_unitaire_reel) * ligne.quantite;
          caCommande += ca;
          produitsVendusCommande += ligne.quantite;
          const produit = ligne.produit;
          coutRevientCommande += produit ? Number(produit.cout_revient) * ligne.quantite : 0;
        }

        caTotal += caCommande;

        const frais = Number(commande.frais_livraison);
        const commission = Number(commande.commission_commercial);

        beneficeNetTotal += caCommande - coutRevientCommande - frais - commission;

        const commercial = (commande as any).commercial;
        if (commercial) {
          if (!commissionsParCommercial[commercial.id]) {
            commissionsParCommercial[commercial.id] = {
              commercial_id: commercial.id,
              nom: commercial.nom,
              produits_vendus: 0,
              montant_du: 0,
              bonus: 0
            };
          }
          commissionsParCommercial[commercial.id].produits_vendus += produitsVendusCommande;
          commissionsParCommercial[commercial.id].montant_du += commission;
        }
      }

      // 4bis. Bonus mensuel par commercial, selon les paliers configurés
      // par l'admin (voir BonusService) et le nombre de commandes
      // SOUMISES dans le mois — même métrique que le dashboard commercial
      // en temps réel, pas seulement les commandes livrées : un
      // commercial actif est récompensé même si une partie de ses
      // commandes a fini annulée.
      const commandesSoumisesMois = await Commande.findAll({
        where: { date_creation: { [Op.between]: [debutMois, finMois] } },
        attributes: ['id', 'commercial_id'],
        include: [{ model: User, as: 'commercial', attributes: ['id', 'nom'] }],
        transaction
      });

      const commandesParCommercial: Record<string, { nom: string; count: number }> = {};
      for (const c of commandesSoumisesMois) {
        const commercial = (c as any).commercial;
        if (!commercial) continue;
        if (!commandesParCommercial[commercial.id]) {
          commandesParCommercial[commercial.id] = { nom: commercial.nom, count: 0 };
        }
        commandesParCommercial[commercial.id].count += 1;
      }

      let bonusTotal = 0;
      for (const [commercialId, info] of Object.entries(commandesParCommercial)) {
        const { montant: bonus } = await this.bonusService.calculerBonus(commercialId, info.count);
        if (bonus <= 0) continue;

        bonusTotal += bonus;
        if (!commissionsParCommercial[commercialId]) {
          commissionsParCommercial[commercialId] = {
            commercial_id: commercialId,
            nom: info.nom,
            produits_vendus: 0,
            montant_du: 0,
            bonus: 0
          };
        }
        commissionsParCommercial[commercialId].bonus = bonus;
      }
      beneficeNetTotal -= bonusTotal;

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

      await Commande.update(
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
