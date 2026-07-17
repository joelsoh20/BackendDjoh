import { BaseRepository } from './BaseRepository';
import { Charge } from '../models/Charge';
import { Op } from 'sequelize';
import { TypeCharge } from '../types';

export class ChargeRepository extends BaseRepository<Charge> {
  constructor() {
    super(Charge);
  }

  async findByType(type: TypeCharge): Promise<Charge[]> {
    return this.findAll({ where: { type } as any });
  }

  async findByPeriode(debut: Date, fin: Date): Promise<Charge[]> {
    return this.findAll({
      where: {
        date: { [Op.between]: [debut, fin] }
      }
    });
  }

  async getTotalByType(type: TypeCharge, debut: Date, fin: Date): Promise<number> {
    const charges = await this.findAll({
      where: {
        type,
        date: { [Op.between]: [debut, fin] }
      }
    });
    return charges.reduce((sum, c) => sum + Number(c.montant), 0);
  }
}