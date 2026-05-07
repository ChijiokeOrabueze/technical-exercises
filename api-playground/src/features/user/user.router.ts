import { Router } from "express";
import UserController from "./user.controller";
import { AppContext } from "../../app-context";
import validate from "../../validations";
import { findUserValidation } from "../../validations/user.validations";

const userRouter = () => {
  const router = Router();

  const userController = new UserController(AppContext.getUserService());

  router.post(
    "/:userId",
    validate(findUserValidation),
    userController.findUser
  );

  return router;
};

export default userRouter;
