import { db } from "./config";
// import User from "./models/user/user.model";

async function createDbConnection() {
  console.log("Connecting to database...");
  try {
    await db.authenticate();

    // Sync all models at once or sync individually.
    // Syncing individually allows you to controll each differently.
    // E.g drop only specific tables without affecting the rest.
    await db.sync();

    // E.g of individual sync.
    // await User.sync({ alter: { drop: false } });

    console.log("Database connection successful!");
  } catch (error: any) {
    console.log("Unable to connect to the database:", error);
    process.exit(1);
  }
}

export default createDbConnection;
