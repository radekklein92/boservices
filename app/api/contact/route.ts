import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getRedis, type Lead } from "@/lib/redis";
import { notifyLead } from "@/lib/email";

const schema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  company: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(2).max(4000),
  locale: z.enum(["cs", "en"]).default("cs"),
  website: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.website && parsed.data.website.trim() !== "") {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  const lead: Lead = {
    id: randomUUID(),
    name: parsed.data.name,
    email: parsed.data.email,
    company: parsed.data.company || undefined,
    message: parsed.data.message,
    locale: parsed.data.locale,
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
    createdAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    try {
      await Promise.all([
        redis.set(`lead:${lead.id}`, lead),
        redis.lpush("leads:index", lead.id),
      ]);
    } catch (err) {
      console.error("redis lead persist failed", err);
    }
  } else {
    console.warn("[contact] Upstash Redis not configured - lead not persisted");
  }

  try {
    await notifyLead(lead);
  } catch (err) {
    console.error("resend notify failed", err);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
