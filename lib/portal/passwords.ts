import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 10) issues.push("Heslo musí mít aspoň 10 znaků.");
  if (!/[A-Z]/.test(password)) issues.push("Heslo musí obsahovat velké písmeno.");
  if (!/[a-z]/.test(password)) issues.push("Heslo musí obsahovat malé písmeno.");
  if (!/\d/.test(password)) issues.push("Heslo musí obsahovat číslici.");
  return issues;
}
