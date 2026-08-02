import { User } from '../models/User';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { ProductCommission } from '../models/ProductCommission';

export class CommissionService {

  /**
   * Calcule la commission due au commercial pour UNE commande (une seule
   * fois pour toute la commande, quel que soit le nombre de produits
   * qu'elle contient).
   * - Mode "forfaitaire" : toujours la commission_defaut du commercial.
   * - Mode "par_produit" :
   *    - si la commande ne contient qu'un seul produit distinct et qu'une
   *      commission spécifique existe pour ce produit → ce montant.
   *    - sinon (plusieurs produits différents, ou pas de tarif spécifique
   *      défini) → la commission_defaut du commercial.
   */
  async calculerCommission(commande: Commande, lignes: CommandeLigne[]): Promise<number> {
    const commercial = await User.findByPk(commande.commercial_id);
    if (!commercial) return 0;

    if (commercial.commission_mode === 'par_produit') {
      const produitsDistincts = new Set(lignes.map(l => l.product_id));

      if (produitsDistincts.size === 1) {
        const productId = lignes[0].product_id;
        const commissionProduit = await ProductCommission.findOne({
          where: { user_id: commande.commercial_id, product_id: productId }
        });

        if (commissionProduit) {
          return Number(commissionProduit.montant);
        }
      }
    }

    return Number(commercial.commission_defaut);
  }
}
