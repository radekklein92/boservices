import { z } from "zod";

// Validace vstupu API úkolů. taskInputSchema = vytvoření (s defaulty),
// taskUpdateSchema = částečná aktualizace (merge do existujícího).

export const subtaskSchema = z.object({
  id: z.string().max(100),
  title: z.string().trim().max(500),
  done: z.boolean(),
});

export const notificationSchema = z.object({
  id: z.string().max(100),
  email: z.string().trim().email().max(200),
  daysBefore: z.number().int().min(0).max(60),
});

export const linksSchema = z.object({
  clientIds: z.array(z.string().max(100)).max(50).default([]),
  locationIds: z.array(z.string().max(100)).max(50).default([]),
  contractIds: z.array(z.string().max(100)).max(50).default([]),
});

export const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Zadejte název.").max(300),
  assignee: z.string().trim().max(200).default(""),
  requester: z.string().trim().max(200).default(""),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Neplatné datum.")
    .nullable()
    .default(null),
  status: z.enum(["todo", "in_progress", "done"]).default("todo"),
  body: z.string().max(20_000).nullable().default(null),
  subtasks: z.array(subtaskSchema).max(100).default([]),
  notifications: z.array(notificationSchema).max(50).default([]),
  links: linksSchema.default({
    clientIds: [],
    locationIds: [],
    contractIds: [],
  }),
});

export const taskUpdateSchema = taskInputSchema.partial();
