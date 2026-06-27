import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/portal/auth-guard";

// AI návrh města pro párování pokladny. Z názvu pokladny (a názvu prodejny + města
// z dat DW jako nápovědy) odhadne město provozovny. Admin-only, volá se on-demand
// při otevření editoru řádku. Graceful: chybí-li ANTHROPIC_API_KEY nebo AI selže,
// vrátí nápovědu z dat (cityHint), takže pole se vždy rozumně předvyplní.
export const maxDuration = 20;

const schema = z.object({
  shopName: z.string().min(1).max(240),
  locationName: z.string().max(240).optional(),
  cityHint: z.string().max(120).optional(),
});

const SYSTEM =
  "Jsi nástroj na určení města provozovny z názvu pokladny a prodejny. Odpovídáš VÝHRADNĚ " +
  "samotným názvem města (např. 'Praha', 'Brandýs nad Labem', 'Düsseldorf'), bez kraje, okresu, " +
  "státu a bez jakéhokoli dalšího textu. Když město nelze spolehlivě určit, odpovíš prázdně.";

export async function POST(req: Request) {
  const g = await requireAdmin();
  if (!g.ok) return g.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Neplatná data" }, { status: 400 });
  }
  const { shopName, locationName, cityHint } = parsed.data;

  const fallback = (cityHint ?? "").trim();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, city: fallback, source: "hint" });
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 15_000 });
    const lines = [
      `Pokladna: "${shopName}"`,
      locationName ? `Prodejna: "${locationName}"` : null,
      cityHint ? `Město z dat pokladního systému (nápověda): "${cityHint}"` : null,
    ].filter(Boolean);
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 32,
      system: SYSTEM,
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    const textBlock = res.content.find((b) => b.type === "text");
    let city = textBlock && "text" in textBlock ? textBlock.text.trim() : "";
    city = (city.split("\n")[0] ?? "").trim().slice(0, 60);
    if (/nelze|nezn|unknown|^n\/a$/i.test(city)) city = "";
    return NextResponse.json({ ok: true, city: city || fallback, source: city ? "ai" : "hint" });
  } catch {
    // AI nedostupná / chyba parsování → nezablokovat, vrátit nápovědu z dat.
    return NextResponse.json({ ok: true, city: fallback, source: "hint" });
  }
}
