import { Database } from './config/database';
import { setupAssociations } from './config/associations';
import { User } from './models/User';
import dotenv from 'dotenv';
dotenv.config();

const seed = async () => {
  await Database.connect();
  setupAssociations();
  await Database.getInstance().sync({ force: true });

  await User.create({
    nom: 'Admin',
    email: 'admin@test.com',
    mot_de_passe: 'admin123',
    role: 'admin',
    commission_mode: 'forfaitaire',
    commission_defaut: 1000
  });

  await User.create({
    nom: 'Commercial Test',
    email: 'commercial@test.com',
    mot_de_passe: 'com123',
    role: 'commercial',
    commission_mode: 'forfaitaire',
    commission_defaut: 1000
  });

  console.log('✅ Données de test créées');
  console.log('Admin : admin@test.com / admin123');
  console.log('Commercial : commercial@test.com / com123');
  process.exit(0);
};

seed();