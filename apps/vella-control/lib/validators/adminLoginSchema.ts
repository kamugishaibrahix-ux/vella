import { z } from "zod";

/**
 * Login request body. Strict to reject unknown fields.
 * Max lengths limit payload size and brute-force surface.
 */
export const adminLoginSchema = z
  .object({
    email: z.string().email("Invalid email format").max(255, "Email too long"),
    password: z.string().min(8, "Password must be at least 8 characters").max(256, "Password too long"),
  })
  .strict();

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
