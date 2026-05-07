import { UserSelectType } from "../../db/models/user/user.model";
import { UserResponseDto } from "./user.dto";

export const mapToUserResponseDto = ({
  name,
  username,
  id,
}: UserSelectType): UserResponseDto => {
  return {
    id,
    name,
    username,
  };
};
