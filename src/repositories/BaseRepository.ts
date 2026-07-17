import { Model, ModelStatic, FindOptions, CreateOptions, UpdateOptions, DestroyOptions } from 'sequelize';

export abstract class BaseRepository<T extends Model> {
  protected model: ModelStatic<T>;

  constructor(model: ModelStatic<T>) {
    this.model = model;
  }

  async findAll(options?: FindOptions): Promise<T[]> {
    return this.model.findAll(options);
  }

  async findById(id: string, options?: FindOptions): Promise<T | null> {
    return this.model.findByPk(id, options);
  }

  async findOne(options: FindOptions): Promise<T | null> {
    return this.model.findOne(options);
  }

  async create(data: any): Promise<T> {
    return this.model.create(data);
  }

  async update(id: string, data: any): Promise<[number]> {
    return this.model.update(data, { where: { id } as any });
  }

  async delete(id: string): Promise<number> {
    return this.model.destroy({ where: { id } as any });
  }

  async count(options?: FindOptions): Promise<number> {
    return this.model.count(options);
  }
}