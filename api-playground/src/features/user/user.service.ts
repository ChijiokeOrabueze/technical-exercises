import { UserResponseDto } from "./user.dto";

export interface UserService {
  findUser: (userId: number) => Promise<UserResponseDto | null>;
}
