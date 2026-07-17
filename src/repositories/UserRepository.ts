import { BaseRepository } from './BaseRepository';
import { User } from '../models/User';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
  }

  async findByNom(nom: string): Promise<User | null> {
    return this.findOne({ where: { nom } });
  }

  async findByRole(role: string): Promise<User[]> {
    return this.findAll({ where: { role, actif: true } as any });
  }

  async findCommerciaux(): Promise<User[]> {
    return this.findAll({ where: { role: 'commercial', actif: true } as any });
  }

  async toggleActif(id: string): Promise<User | null> {
    const user = await this.findById(id);
    if (user) {
      user.actif = !user.actif;
      await user.save();
    }
    return user;
  }
}