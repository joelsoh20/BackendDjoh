import { BonusPalier } from '../models/BonusPalier';

export interface ResultatBonus {
  montant: number;
  palierAtteint: number | null;
  prochainPalier: { nombre_commandes: number; montant: number; commandesRestantes: number } | null;
}

export class BonusService {

  /**
   * Bonus dû à un commercial pour un nombre de commandes donné (sur une
   * période, typiquement le mois en cours). Les paliers ne se cumulent
   * pas : seul le palier le plus haut atteint est payé.
   *
   * Renvoie aussi le prochain palier non encore atteint, pour permettre
   * d'afficher une progression ("plus que X commandes pour Y FCFA").
   */
  async calculerBonus(userId: string, nombreCommandes: number): Promise<ResultatBonus> {
    const paliers = await BonusPalier.findAll({
      where: { user_id: userId },
      order: [['nombre_commandes', 'ASC']]
    });

    let palierAtteint: BonusPalier | null = null;
    let prochainPalier: BonusPalier | null = null;

    for (const p of paliers) {
      if (nombreCommandes >= p.nombre_commandes) {
        palierAtteint = p;
      } else if (!prochainPalier) {
        prochainPalier = p;
      }
    }

    return {
      montant: palierAtteint ? Number(palierAtteint.montant) : 0,
      palierAtteint: palierAtteint ? palierAtteint.nombre_commandes : null,
      prochainPalier: prochainPalier ? {
        nombre_commandes: prochainPalier.nombre_commandes,
        montant: Number(prochainPalier.montant),
        commandesRestantes: prochainPalier.nombre_commandes - nombreCommandes
      } : null
    };
  }
}
