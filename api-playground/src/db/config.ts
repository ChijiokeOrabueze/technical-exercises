import { Sequelize } from "sequelize";

export const db = new Sequelize(
  process.env.DB_NAME as string,
  process.env.DB_USERNAME as string,
  process.env.DB_PASSWORD as string,
  {
    dialect: "postgres",
    logQueryParameters: false,
    logging: false,
    benchmark: true,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    query: { raw: true },
  }
);
