import { StockLivraison } from '../models/StockLivraison';
import { Product } from '../models/Product';

export interface ProduitManquant {
  productId: string;
  nom: string;
  demande: number;
  disponible: number;
  manquant: number;
}

/**
 * Vérifie que le service de livraison a bien tout le stock nécessaire
 * pour livrer l'ensemble des lignes d'une commande. Contrairement à un
 * simple "premier produit en rupture trouvé, on s'arrête", ceci
 * parcourt TOUTES les lignes et retourne la liste complète des manques,
 * pour que l'utilisateur puisse voir d'un coup ce qu'il manque.
 */
export async function verifierStockService(
  serviceLivraisonId: string,
  lignes: { product_id: string; quantite: number }[]
): Promise<{ ok: boolean; manquants: ProduitManquant[] }> {
  const manquants: ProduitManquant[] = [];

  for (const ligne of lignes) {
    const stock = await StockLivraison.findOne({
      where: { service_id: serviceLivraisonId, product_id: ligne.product_id }
    });
    const disponible = stock?.quantite || 0;

    if (disponible < ligne.quantite) {
      const produit = await Product.findByPk(ligne.product_id, { attributes: ['nom'] });
      manquants.push({
        productId: ligne.product_id,
        nom: produit?.nom || 'Produit inconnu',
        demande: ligne.quantite,
        disponible,
        manquant: ligne.quantite - disponible,
      });
    }
  }

  return { ok: manquants.length === 0, manquants };
}

export function formaterMessageManquants(manquants: ProduitManquant[]): string {
  const detail = manquants
    .map(m => `${m.nom} (besoin ${m.demande}, disponible ${m.disponible}, manque ${m.manquant})`)
    .join(' ; ');
  return `La somme totale des produits n'est pas disponible dans ce service de livraison, veuillez choisir un autre service. Produits manquants : ${detail}`;
}
