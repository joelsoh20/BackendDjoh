/**
 * Migration : orders (avec group_id dupliqué par produit)
 *          -> commandes (en-tête) + commande_lignes (produits)
 *
 * À exécuter UNE SEULE FOIS, avant de déployer le nouveau backend,
 * pendant une fenêtre de maintenance (arrêter l'API le temps de la
 * migration pour éviter que de nouvelles commandes soient créées
 * dans l'ancienne table pendant l'opération).
 *
 * Lancement :   npx tsx src/scripts/migrateCommandes.ts
 * (ou "npm run migrate:commandes" si vous ajoutez ce script dans package.json)
 *
 * Sécurité :
 * - Ne supprime ni ne modifie la table "orders" existante (backup naturel).
 * - Idempotent : si "commandes" contient déjà des lignes, le script
 *   s'arrête sans rien faire (sauf si MIGRATION_FORCE=1).
 * - Tout se fait dans une seule transaction : si quoi que ce soit
 *   échoue, rien n'est appliqué.
 * - Les commande_lignes réutilisent l'id d'origine de chaque ligne
 *   "orders", et chaque commande réutilise le group_id d'origine comme
 *   nouvel id — donc rien à recalculer côté order_comments : on peut
 *   simplement retrouver le commande_id via l'ancien group_id.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Database } from '../config/database';
import { QueryTypes } from 'sequelize';
import '../models/Commande';
import '../models/CommandeLigne';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';

interface OldOrderRow {
  id: string;
  client_nom: string;
  client_telephone: string | null;
  client_quartier: string | null;
  product_id: string;
  quantite: number;
  prix_unitaire_reel: string;
  commercial_id: string;
  deliverer_id: string | null;
  frais_livraison: string;
  statut: string;
  commission_commercial: string;
  date_statut_livree: string | null;
  cloture_id: string | null;
  group_id: string;
  service_livraison_id: string | null;
  motif_annulation: string | null;
  date_creation: string;
  date_modification: string;
}

const CHAMPS_ENTETE = [
  'client_nom', 'client_telephone', 'client_quartier', 'commercial_id',
  'deliverer_id', 'frais_livraison', 'statut', 'commission_commercial',
  'date_statut_livree', 'cloture_id', 'service_livraison_id', 'motif_annulation'
] as const;

async function main() {
  const sequelize = Database.getInstance();
  await sequelize.authenticate();
  console.log('✅ Connecté à la base');

  // 1. Garde-fou d'idempotence
  const dejaMigre = await Commande.count();
  if (dejaMigre > 0 && process.env.MIGRATION_FORCE !== '1') {
    console.log(`⚠️  La table "commandes" contient déjà ${dejaMigre} ligne(s).`);
    console.log('   Migration déjà effectuée (ou partielle). Rien fait.');
    console.log('   Pour forcer une réexécution : MIGRATION_FORCE=1 npx tsx src/scripts/migrateCommandes.ts');
    process.exit(0);
  }

  // 2. Créer les nouvelles tables si elles n'existent pas encore
  await Commande.sync();
  await CommandeLigne.sync();
  console.log('✅ Tables "commandes" et "commande_lignes" prêtes');

  // 3. Ajouter la colonne commande_id à order_comments si absente
  await sequelize.query(`ALTER TABLE order_comments ADD COLUMN IF NOT EXISTS commande_id UUID;`);

  // 4. Charger toutes les anciennes lignes "orders"
  const rows = await sequelize.query<OldOrderRow>(
    `SELECT * FROM orders ORDER BY date_creation ASC`,
    { type: QueryTypes.SELECT }
  );
  console.log(`ℹ️  ${rows.length} ligne(s) trouvée(s) dans "orders"`);

  if (rows.length === 0) {
    console.log('Rien à migrer.');
    process.exit(0);
  }

  // 5. Grouper par group_id
  const groupes = new Map<string, OldOrderRow[]>();
  for (const row of rows) {
    const key = row.group_id || row.id; // filet de sécurité si group_id est jamais null
    if (!groupes.has(key)) groupes.set(key, []);
    groupes.get(key)!.push(row);
  }
  console.log(`ℹ️  ${groupes.size} commande(s) distincte(s) (par group_id)`);

  const anomalies: { group_id: string; champ: string; valeurs: string[] }[] = [];
  const transaction = await sequelize.transaction();

  try {
    let commandesCreees = 0;
    let lignesCreees = 0;

    for (const [groupId, lignesOrigine] of groupes) {
      // Ligne "canonique" = la plus récemment modifiée du groupe
      const canonique = [...lignesOrigine].sort(
        (a, b) => new Date(b.date_modification).getTime() - new Date(a.date_modification).getTime()
      )[0];

      // Détection d'incohérences entre lignes d'un même groupe (à titre informatif)
      for (const champ of CHAMPS_ENTETE) {
        const valeurs = new Set(lignesOrigine.map(l => String((l as any)[champ])));
        if (valeurs.size > 1) {
          anomalies.push({ group_id: groupId, champ, valeurs: Array.from(valeurs) });
        }
      }

      const dateCreation = lignesOrigine.reduce(
        (min, l) => (new Date(l.date_creation) < new Date(min) ? l.date_creation : min),
        lignesOrigine[0].date_creation
      );

      const prixTotal = lignesOrigine.reduce(
        (sum, l) => sum + Number(l.prix_unitaire_reel) * l.quantite, 0
      );

      await Commande.create({
        id: groupId,
        client_nom: canonique.client_nom,
        client_telephone: canonique.client_telephone,
        client_quartier: canonique.client_quartier,
        commercial_id: canonique.commercial_id,
        deliverer_id: canonique.deliverer_id,
        frais_livraison: canonique.frais_livraison,
        statut: canonique.statut,
        commission_commercial: canonique.commission_commercial,
        prix_total: Math.round(prixTotal),
        date_statut_livree: canonique.date_statut_livree,
        cloture_id: canonique.cloture_id,
        service_livraison_id: canonique.service_livraison_id,
        motif_annulation: canonique.motif_annulation,
        date_creation: dateCreation,
      }, { transaction });
      commandesCreees++;

      for (const ligne of lignesOrigine) {
        await CommandeLigne.create({
          id: ligne.id,
          commande_id: groupId,
          product_id: ligne.product_id,
          quantite: ligne.quantite,
          prix_unitaire_reel: ligne.prix_unitaire_reel,
          date_creation: ligne.date_creation,
        }, { transaction });
        lignesCreees++;
      }
    }

    // 6. Rattacher les commentaires à la commande via l'ancien group_id
    await sequelize.query(
      `UPDATE order_comments oc
       SET commande_id = o.group_id
       FROM orders o
       WHERE o.id = oc.order_id AND oc.commande_id IS NULL`,
      { transaction }
    );

    const [orphelins] = await sequelize.query(
      `SELECT COUNT(*)::int as n FROM order_comments WHERE commande_id IS NULL`,
      { transaction, type: QueryTypes.SELECT }
    ) as any;

    await transaction.commit();

    console.log('\n✅ MIGRATION TERMINÉE');
    console.log(`   Commandes créées   : ${commandesCreees}`);
    console.log(`   Lignes créées      : ${lignesCreees}`);
    console.log(`   Commentaires liés  : via UPDATE (orphelins restants : ${(orphelins as any)?.n ?? 0})`);

    if (anomalies.length > 0) {
      console.log(`\n⚠️  ${anomalies.length} incohérence(s) détectée(s) entre lignes d'une même commande`);
      console.log('   (la valeur de la ligne la plus récemment modifiée a été retenue pour l\'en-tête)');
      console.log('   Détail (10 premières) :');
      for (const a of anomalies.slice(0, 10)) {
        console.log(`   - commande ${a.group_id} / champ "${a.champ}" : valeurs différentes = [${a.valeurs.join(', ')}]`);
      }
    } else {
      console.log('\n✅ Aucune incohérence détectée entre les lignes d\'une même commande.');
    }

    console.log('\nℹ️  La table "orders" et la colonne "order_comments.order_id" n\'ont PAS été');
    console.log('   supprimées — vous pouvez les garder comme sauvegarde le temps de valider,');
    console.log('   puis les supprimer manuellement quand vous êtes confiant.');

    process.exit(0);
  } catch (err) {
    await transaction.rollback();
    console.error('❌ Erreur pendant la migration, tout a été annulé :', err);
    process.exit(1);
  }
}

main();
