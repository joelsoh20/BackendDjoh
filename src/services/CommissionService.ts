import { User } from '../models/User';
import { Order } from '../models/Order';

export class CommissionService {
  
  async calculerCommission(order: Order): Promise<number> {
    const commercial = await User.findByPk(order.commercial_id);
    if (!commercial) return 0;

    return Number(commercial.commission_defaut);
  }
}