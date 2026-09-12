// Mirrors app/page.tsx's `brandModels` (model names only — this shared list
// doesn't need the hero images the customer-facing brand/model picker uses).
// Single source of truth for "which bike models exist for this brand" used
// by both the admin product form (compatible-models picker) and the admin
// Products list (Model filter), so the two never drift apart.
export const BRAND_MODELS: Record<string, string[]> = {
  Honda: ["Activa 6G", "Activa 125", "Shine", "SP 125", "Unicorn", "Hornet 2.0", "CB 200X", "CB Shine", "Dio", "Livo", "X-Blade", "CB 350"],
  Hero: ["Splendor Plus", "HF Deluxe", "Passion Pro", "Glamour", "Xtreme 125R", "Xtreme 160R", "Xpulse 200", "Maestro Edge"],
  TVS: ["Apache RTR 160", "Apache RTR 200", "Apache RR 310", "Raider 125", "Jupiter", "Ntorq 125", "Sport", "Star City Plus"],
  Bajaj: ["Pulsar 125", "Pulsar 150", "Pulsar NS200", "Pulsar N160", "Dominar 250", "Dominar 400", "Avenger 160", "Platina 110"],
  Yamaha: ["R15 V4", "MT 15", "FZ-S FI", "FZ-X", "Fascino 125", "RayZR 125", "Aerox 155", "Fazer"],
  "Royal Enfield": ["Classic 350", "Bullet 350", "Hunter 350", "Meteor 350", "Himalayan", "Scram 411", "Interceptor 650", "Continental GT"],
  Suzuki: ["Gixxer", "Gixxer SF", "Access 125", "Burgman Street", "V-Strom SX", "Hayabusa", "Avenis", "Intruder"],
  KTM: ["Duke 125", "Duke 200", "Duke 250", "Duke 390", "RC 125", "RC 200", "RC 390", "Adventure 390"],
  Jawa: ["Jawa 42", "Jawa Classic", "Perak", "42 Bobber"],
  Aprilia: ["SR 125", "SR 160", "SXR 125", "SXR 160", "RS 457"],
  Kawasaki: ["Ninja 300", "Ninja 400", "Ninja ZX-4R", "Z650", "Versys 650", "Vulcan S"],
  BMW: ["G 310 R", "G 310 GS", "G 310 RR", "S 1000 RR", "R 1250 GS", "F 850 GS"],
};

/** Every catalogued model across all brands, deduped and sorted — used when no brand filter is picked. */
export const ALL_BIKE_MODELS: string[] = Array.from(
  new Set(Object.values(BRAND_MODELS).flat())
).sort((a, b) => a.localeCompare(b));
