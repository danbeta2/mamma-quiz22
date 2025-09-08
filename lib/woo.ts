// Helper per WooCommerce REST API (autenticata). Solo server-side.

export type WooProduct = {
  id: number;
  name: string;
  permalink: string;
  short_description?: string;
  description?: string;
  price?: string;          // come stringa in Woo REST
  regular_price?: string;
  sale_price?: string | null;
  stock_status?: "instock" | "outofstock" | "onbackorder";
  featured?: boolean;
  images?: { src: string; alt?: string }[];
  categories?: { id: number; name: string; slug: string }[];
  tags?: { id: number; name: string; slug: string }[];
};

export type RankedProduct = {
  id: number;
  name: string;
  price: number | null;
  image: string | null;
  permalink: string;
  addToCartUrl: string;
  score: number;
  reasons: string[];
};

const WOO_BASE_URL = process.env.WOO_BASE_URL!;
const WOO_CONSUMER_KEY = process.env.WOO_CONSUMER_KEY!;
const WOO_CONSUMER_SECRET = process.env.WOO_CONSUMER_SECRET!;
const PUBLIC_BASE = process.env.NEXT_PUBLIC_WOO_BASE_URL || WOO_BASE_URL;

if (!WOO_BASE_URL || !WOO_CONSUMER_KEY || !WOO_CONSUMER_SECRET) {
  throw new Error("Missing WooCommerce env vars");
}

// Utility: converte prezzo stringa in numero (euro)
function priceToNumber(p?: string | null): number | null {
  if (!p && p !== "0") return null;
  const n = Number(p);
  return Number.isFinite(n) ? n : null;
}

// Chiamata REST autenticata (Basic Auth con ck/cs tramite query param sicuri lato server)
async function wooGet(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`/wp-json/wc/v3${path}`, WOO_BASE_URL);
  // auth via query string (server only)
  url.searchParams.set("consumer_key", WOO_CONSUMER_KEY);
  url.searchParams.set("consumer_secret", WOO_CONSUMER_SECRET);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const res = await fetch(url.toString(), {
    // Disabilita cache per risultati più freschi (Next server)
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Woo REST error ${res.status}: ${txt}`);
  }
  return res.json();
}

/**
 * Cerca prodotti filtrando per termini, prezzo e disponibilità.
 * - search: testo libero (nome/descrizione)
 * - minPrice/maxPrice: filtri lato server (se il negozio non supporta filtri nativi, applichiamo comunque un post-filtraggio)
 * - perPage: numero max
 */
export async function searchProducts({
  searchTerms,
  minPrice,
  maxPrice,
  perPage = 40,
}: {
  searchTerms: string[];
  minPrice?: number;
  maxPrice?: number;
  perPage?: number;
}): Promise<WooProduct[]> {
  const search = (searchTerms || []).join(" ").trim();
  const params: Record<string, string | number> = {
    per_page: perPage,
    status: "publish",
    orderby: "date", // Ordina per data per avere prodotti più recenti
  };
  if (search) params.search = search;

  let items: WooProduct[] = await wooGet("/products", params);

  // Se non trova nulla con la ricerca specifica, prova senza termini di ricerca
  if (items.length === 0 && search) {
    console.log("No products found with search terms, trying without search");
    const fallbackParams = {
      per_page: perPage,
      status: "publish",
      orderby: "popularity",
    };
    items = await wooGet("/products", fallbackParams);
  }

  // Se ancora non trova nulla, prova con parametri minimi
  if (items.length === 0) {
    console.log("No products found, trying minimal params");
    const minimalParams = {
      per_page: Math.min(perPage, 20),
      status: "publish",
    };
    items = await wooGet("/products", minimalParams);
  }

  // Filtro extra lato server per min/max prezzo se necessario
  const filtered = items.filter(p => {
    const priceNum = priceToNumber(p.price ?? p.sale_price ?? p.regular_price);
    const withinMin = minPrice ? (priceNum != null ? priceNum >= minPrice : false) : true;
    const withinMax = maxPrice ? (priceNum != null ? priceNum <= maxPrice : false) : true;
    return withinMin && withinMax;
  });

  // Se il filtro prezzo elimina tutto, restituisci almeno alcuni prodotti
  if (filtered.length === 0 && items.length > 0) {
    console.log("Price filter removed all products, returning unfiltered results");
    return items.slice(0, 10); // Restituisci almeno 10 prodotti
  }

  return filtered;
}

/**
 * Calcola un punteggio semplice su contenuto, prezzo, stock, tag/categorie.
 */
export function rankProducts(
  items: WooProduct[],
  opts: { searchTerms: string[]; tags: string[]; minPrice?: number; maxPrice?: number }
): RankedProduct[] {
  const terms = (opts.searchTerms || []).map(s => s.toLowerCase());
  const tagWords = (opts.tags || []).map(s => s.toLowerCase());

  function textScore(txt?: string) {
    if (!txt) return 0;
    const t = txt.toLowerCase();
    return terms.reduce((acc, w) => acc + (t.includes(w) ? 1 : 0), 0);
  }

  return items.map(p => {
    const name = p.name || "";
    const desc = `${p.short_description ?? ""} ${p.description ?? ""}`.replace(/<[^>]+>/g, " ");
    const price = priceToNumber(p.price ?? p.sale_price ?? p.regular_price);
    const withinPrice = price != null &&
      (opts.minPrice ? price >= opts.minPrice : true) &&
      (opts.maxPrice ? price <= opts.maxPrice : true);

    const productTagNames = (p.tags || []).map(t => t.name.toLowerCase());
    const productCatNames = (p.categories || []).map(c => c.name.toLowerCase());
    const tagMatch = [...productTagNames, ...productCatNames].some(tn => tagWords.some(w => tn.includes(w)));

    let score = 0;
    score += Math.min(2, textScore(name));               // match nel titolo
    score += Math.min(1, textScore(desc) > 0 ? 1 : 0);   // match descrizione
    score += withinPrice ? 1 : 0;
    score += p.stock_status === "instock" ? 1 : 0;
    score += p.featured ? 1 : 0;
    score += tagMatch ? 2 : 0;

    const reasons: string[] = [];
    if (withinPrice) reasons.push("Rientra nel tuo budget");
    if (p.stock_status === "instock") reasons.push("Disponibile subito");
    if (tagMatch) reasons.push("In linea con le tue preferenze");
    if (textScore(name) >= 1) reasons.push("Adatto all'età/esigenze indicate");

    const addToCartUrl = `${PUBLIC_BASE}/?add-to-cart=${p.id}`;

    return {
      id: p.id,
      name: p.name,
      price,
      image: p.images?.[0]?.src ?? null,
      permalink: p.permalink,
      addToCartUrl,
      score,
      reasons,
    };
  }).sort((a, b) => b.score - a.score);
}
