/**
 * Recalcule la commission des commandes déjà livrées, pour corriger les
 * commandes dont la commission est restée à 0 (données migrées avant les
 * différents correctifs, ou tout autre cas où elle n'a jamais été
 * calculée correctement).
 *
 * Par défaut : MODE APERÇU (dry-run) — n'écrit rien, affiche juste ce qui
 * serait changé, pour valider avant toute modification de données
 * financières.
 *
 * Usage :
 *   npx tsx src/scripts/recalculerCommissions.ts             (aperçu)
 *   npx tsx src/scripts/recalculerCommissions.ts --apply      (applique)
 *
 * Les commandes déjà incluses dans une clôture mensuelle (cloture_id
 * renseigné) sont IGNORÉES : leur commission fait partie d'un instantané
 * déjà figé (MonthlyClosing.commissions_json) — les recalculer créerait
 * une incohérence entre la commande et la clôture déjà validée.
 */

import dotenv from 'dotenv';
dotenv.config();

import { Database } from '../config/database';
import { setupAssociations } from '../config/associations';
import { Commande } from '../models/Commande';
import { CommandeLigne } from '../models/CommandeLigne';
import { CommissionService } from '../services/CommissionService';

async function main() {
  const apply = process.argv.includes('--apply');
  const sequelize = Database.getInstance();
  await sequelize.authenticate();
  setupAssociations();
  console.log('✅ Connecté à la base');
  console.log(apply ? '⚠️  MODE APPLICATION — les commissions seront corrigées en base\n' : 'ℹ️  MODE APERÇU (dry-run) — rien ne sera modifié. Ajoutez --apply pour appliquer.\n');

  const commissionService = new CommissionService();

  const commandes = await Commande.findAll({
    where: { statut: 'livree_payee', cloture_id: null as any },
    include: [{ model: CommandeLigne, as: 'lignes' }]
  });

  console.log(`ℹ️  ${commandes.length} commande(s) livrée(s) et non-clôturée(s) à vérifier\n`);

  const ecarts: { id: string; client: string; ancien: number; nouveau: number }[] = [];

  for (const commande of commandes) {
    const lignes = (commande as any).lignes as CommandeLigne[];
    const nouvelleCommission = await commissionService.calculerCommission(commande, lignes);
    const ancienneCommission = Number(commande.commission_commercial);

    if (Math.round(nouvelleCommission) !== Math.round(ancienneCommission)) {
      ecarts.push({
        id: commande.id,
        client: commande.client_nom,
        ancien: ancienneCommission,
        nouveau: nouvelleCommission,
      });

      if (apply) {
        commande.commission_commercial = nouvelleCommission;
        await commande.save();
      }
    }
  }

  if (ecarts.length === 0) {
    console.log('✅ Aucun écart trouvé — toutes les commissions déjà en base sont correctes.');
  } else {
    console.log(`${apply ? '✅ Corrigé' : '⚠️  Écart trouvé'} sur ${ecarts.length} commande(s) :\n`);
    for (const e of ecarts) {
      console.log(`  - Commande ${e.id} (${e.client}) : ${e.ancien} FCFA → ${e.nouveau} FCFA`);
    }
    if (!apply) {
      console.log('\nPour appliquer ces corrections : npx tsx src/scripts/recalculerCommissions.ts --apply');
    }
  }

  process.exit(0);
}

main();
