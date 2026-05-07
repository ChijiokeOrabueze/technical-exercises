import { BaseRepository } from "..";
import User from "../../db/models/user/user.model";

class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
  }
}

export default UserRepository;
