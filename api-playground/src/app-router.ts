import { Router } from "express";
import userRouter from "./features/user/user.router";

export const appRouter = () => {
  const globalRouter = Router();

  globalRouter.use("/users", userRouter());
  return globalRouter;
};
