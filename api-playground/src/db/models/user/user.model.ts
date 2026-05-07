import {
  Model,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Attributes,
  CreationAttributes,
  CreationOptional,
} from "sequelize";
import { db } from "../../config";

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare username: string;
  declare password: string;
}

User.init(
  {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER,
    },
    name: {
      allowNull: false,
      type: DataTypes.STRING,
    },
    username: {
      allowNull: false,
      type: DataTypes.STRING,
    },
    password: {
      allowNull: false,
      type: DataTypes.STRING,
    },
  },
  {
    sequelize: db,
    modelName: "User",
    tableName: "users",
  }
);

export type UserInsertType = CreationAttributes<User>;
export type UserSelectType = Attributes<User>;

export default User;
