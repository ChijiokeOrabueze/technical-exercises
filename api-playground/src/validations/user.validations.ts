import { z } from "zod";

export const findUserValidation = z.object({
  params: z.object({
    userId: z
      .string({
        required_error: "User ID is required",
        invalid_type_error: "Invalid user ID",
      })
      .refine((value) => !!Number(value)),
  }),
});
