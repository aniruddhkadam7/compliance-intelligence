import { z } from "zod";

export const ListParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(200).optional().default(""),
  sort: z.string().max(40).optional(),
  dir: z.enum(["asc", "desc"]).optional().default("asc"),
});
export type ListParams = z.infer<typeof ListParams>;

export function searchParamsToObject(sp: URLSearchParams) {
  return Object.fromEntries(sp.entries());
}

export const paging = (p: { page: number; pageSize: number }) => ({ skip: (p.page - 1) * p.pageSize, take: p.pageSize });

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
