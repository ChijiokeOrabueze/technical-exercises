import {
  Attributes,
  CreationAttributes,
  Model,
  ModelStatic,
  WhereOptions,
} from "sequelize";

export abstract class BaseRepository<T extends Model> {
  private readonly _model: ModelStatic<T>;

  constructor(model: ModelStatic<T>) {
    this._model = model;
  }

  create = async (data: CreationAttributes<T>): Promise<Attributes<T>> => {
    return await this._model.create(data, {
      raw: true,
      plain: true,
    });
  };

  bulkCreate = async (
    data: CreationAttributes<T>[]
  ): Promise<Attributes<T>[]> => {
    return await this._model.bulkCreate(data, {
      ignoreDuplicates: true,
    });
  };

  delete = async (condition: WhereOptions<Attributes<T>>) => {
    await this._model.destroy({
      where: condition,
    });
  };

  count = async (searchParam: WhereOptions<Attributes<T>>) => {
    return await this._model.count({
      where: searchParam,
    });
  };

  find = async (
    searchParam: WhereOptions<Attributes<T>>
  ): Promise<Attributes<T>[]> => {
    return await this._model.findAll({
      where: searchParam,
      raw: true,
    });
  };
}
