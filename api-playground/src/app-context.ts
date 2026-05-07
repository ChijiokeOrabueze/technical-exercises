import { UserService } from "./features/user/user.service";
import { UserServiceImpl } from "./features/user/user.service.impl";
import UserRepository from "./repositories/user/user.repository";

export class AppContext {
  static getUserRepository = () => new UserRepository();

  static getUserService = (): UserService =>
    new UserServiceImpl(this.getUserRepository());
}
