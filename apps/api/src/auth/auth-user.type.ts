export type AuthUser = {
  sub: string;
  email?: string;
  role?: string;
  claims: Record<string, unknown>;
};
