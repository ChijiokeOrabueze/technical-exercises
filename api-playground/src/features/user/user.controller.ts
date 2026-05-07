import { Request, Response } from "express";
import { UserService } from "./user.service";

class UserController {
  private readonly userService: UserService;

  constructor(userService: UserService) {
    this.userService = userService;
  }

  findUser = async (
    req: Request<{ userId: string }, {}, {}, {}>,
    res: Response
  ) => {
    try {
      const data = await this.userService.findUser(Number(req.params.userId));

      res.status(200).json({
        message: "User fetched",
        data,
        status: "success",
      });
    } catch (error: any) {
      res.status(400).json({
        error,
        message: "An error occured",
        status: "failed",
      });
    }
  };
}

export default UserController;
