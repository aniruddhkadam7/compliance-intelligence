"use client";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./api";

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: () => apiGet<{ user: string; role: string; canWrite: boolean }>("/api/auth/me"), staleTime: 300_000 });
}
