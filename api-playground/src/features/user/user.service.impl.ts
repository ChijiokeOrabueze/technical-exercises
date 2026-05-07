import UserRepository from "../../repositories/user/user.repository";
import { mapToUserResponseDto } from "./user.mapper";
import { UserService } from "./user.service";

export class UserServiceImpl implements UserService {
  private readonly userRepository: UserRepository;

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository;
  }

  findUser = async (userId: number) => {
    const [user] = await this.userRepository.find({ id: userId });

    // Throw error if needed.
    if (!user) return null;

    return mapToUserResponseDto(user);
  };
}
