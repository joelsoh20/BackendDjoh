/**
 * Vérifie le VRAI statut de livraison d'une notification push à partir
 * de son ticket ID (visible dans les logs serveur, ex: "019fc373-...").
 *
 * Un ticket "ok" veut seulement dire qu'Expo a accepté la demande — pas
 * qu'elle est arrivée sur le téléphone. La livraison réelle (relais vers
 * Firebase/FCM pour Android ou APNs pour iOS) n'est confirmée qu'ici,
 * via le "reçu" (receipt), disponible en général quelques minutes après
 * l'envoi (jusqu'à 24h après selon Expo).
 *
 * Usage :
 *   npx tsx src/scripts/checkPushReceipts.ts <ticketId1> <ticketId2> ...
 *
 * Exemple avec les tickets d'un log récent :
 *   npx tsx src/scripts/checkPushReceipts.ts 019fc373-b9ec-7486-ba7d-928a1c6dc59f 019fc373-bb05-713b-9345-4ca201d8e0b9
 */

import dotenv from 'dotenv';
dotenv.config();

import { Expo } from 'expo-server-sdk';

async function main() {
  const ticketIds = process.argv.slice(2);

  if (ticketIds.length === 0) {
    console.log('Usage : npx tsx src/scripts/checkPushReceipts.ts <ticketId1> <ticketId2> ...');
    console.log('(les ticketId se trouvent dans les logs serveur, sur la ligne "tickets reçus d\'Expo")');
    process.exit(1);
  }

  const expo = new Expo();
  console.log(`Vérification de ${ticketIds.length} ticket(s)...\n`);

  const chunks = expo.chunkPushNotificationReceiptIds(ticketIds);

  for (const chunk of chunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk);

      for (const ticketId of Object.keys(receipts)) {
        const receipt = receipts[ticketId] as any;
        if (!receipt) {
          console.log(`⏳ ${ticketId} : pas encore de reçu disponible (réessayez dans quelques minutes)`);
          continue;
        }

        if (receipt.status === 'ok') {
          console.log(`✅ ${ticketId} : livré avec succès au service Apple/Google`);
        } else {
          console.log(`❌ ${ticketId} : ÉCHEC — ${receipt.message}`);
          if (receipt.details?.error) {
            console.log(`   Type d'erreur : ${receipt.details.error}`);
            if (receipt.details.error === 'DeviceNotRegistered') {
              console.log('   → Le token du téléphone n\'est plus valide (app désinstallée/réinstallée, ou build différente). Il faut se reconnecter dans l\'app pour régénérer un token.');
            }
            if (receipt.details.error === 'InvalidCredentials') {
              console.log('   → Les identifiants push (Firebase FCM pour Android / APNs pour iOS) ne sont pas configurés correctement côté EAS pour ce build. Vérifiez "npx eas credentials".');
            }
            if (receipt.details.error === 'MessageTooBig') {
              console.log('   → Le message était trop long.');
            }
            if (receipt.details.error === 'MessageRateExceeded') {
              console.log('   → Trop de notifications envoyées trop vite à ce token.');
            }
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des reçus :', error);
    }
  }
}

main();
