import dotenv from "dotenv";
dotenv.config();
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { appRouter } from "./app-router";
import createDbConnection from "./db/connect";

const app = express();
const port = process.env.PORT || 8000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

app.use(helmet());
app.use(express.json());

app.use(`/api/v1`, appRouter());

app.get("/", (_, res) => {
  res.send("Hello World!");
});

const init = async () => {
  await createDbConnection();
  app.listen(port, () => {
    return console.log(`Server is listening on port ${port}`);
  });
};

init();
