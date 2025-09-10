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
  
  // Prova diverse strategie di ricerca per varietà
  const searchStrategies = [
    // Strategia 1: ricerca completa con termini
    {
      params: {
        per_page: perPage,
        status: "publish",
        orderby: "date",
        search: search || undefined,
      },
      name: "full search"
    },
    // Strategia 2: ricerca per popolarità se la prima fallisce
    {
      params: {
        per_page: perPage,
        status: "publish", 
        orderby: "popularity",
        search: search || undefined,
      },
      name: "popularity search"
    },
    // Strategia 3: ricerca casuale per varietà
    {
      params: {
        per_page: perPage,
        status: "publish",
        orderby: "rand",
      },
      name: "random search"
    },
    // Strategia 4: ricerca per rating
    {
      params: {
        per_page: Math.min(perPage, 30),
        status: "publish",
        orderby: "rating",
        search: search || undefined,
      },
      name: "rating search"
    }
  ];

  let items: WooProduct[] = [];
  
  // Prova le strategie in ordine finché non trova prodotti
  for (const strategy of searchStrategies) {
    try {
      console.log(`Trying ${strategy.name} with params:`, strategy.params);
      const results = await wooGet("/products", strategy.params);
      
      if (results && results.length > 0) {
        items = results;
        console.log(`Found ${items.length} products with ${strategy.name}`);
        break;
      }
    } catch (error) {
      console.log(`${strategy.name} failed:`, error);
      continue;
    }
  }

  // Fallback finale se tutto fallisce
  if (items.length === 0) {
    console.log("All strategies failed, trying absolute minimal params");
    try {
      items = await wooGet("/products", {
        per_page: 20,
        status: "publish",
      });
    } catch (error) {
      console.log("Even minimal search failed:", error);
      return [];
    }
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
 * Calcola un punteggio dinamico e vario per evitare sempre gli stessi prodotti
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

  // Funzione per aggiungere varietà al punteggio
  function addVariety(baseScore: number, productId: number): number {
    // Usa l'ID del prodotto per creare una variazione consistente ma diversa
    const variation = (productId * 7 + Date.now() / 1000000) % 1; // Varia nel tempo
    return baseScore + (variation * 0.5); // Aggiunge fino a 0.5 punti di variazione
  }

  const rankedProducts = items.map(p => {
    const name = p.name || "";
    const desc = `${p.short_description ?? ""} ${p.description ?? ""}`.replace(/<[^>]+>/g, " ");
    const price = priceToNumber(p.price ?? p.sale_price ?? p.regular_price);
    const withinPrice = price != null &&
      (opts.minPrice ? price >= opts.minPrice : true) &&
      (opts.maxPrice ? price <= opts.maxPrice : true);

    const productTagNames = (p.tags || []).map(t => t.name.toLowerCase());
    const productCatNames = (p.categories || []).map(c => c.name.toLowerCase());
    const tagMatch = [...productTagNames, ...productCatNames].some(tn => tagWords.some(w => tn.includes(w)));

    // Punteggio base migliorato
    let score = 0;
    const nameScore = textScore(name);
    const descScore = textScore(desc);
    
    // Punteggi più dettagliati
    score += Math.min(3, nameScore * 1.5);              // match nel titolo (peso maggiore)
    score += Math.min(2, descScore > 0 ? descScore : 0); // match descrizione
    score += withinPrice ? 2 : 0;                        // budget match importante
    score += p.stock_status === "instock" ? 1.5 : 0;    // disponibilità
    score += p.featured ? 1 : 0;                         // prodotti in evidenza
    score += tagMatch ? 3 : 0;                           // match categoria/tag molto importante
    
    // Bonus per diversi tipi di prodotto
    const nameLower = name.toLowerCase();
    if (nameLower.includes('pokemon') || nameLower.includes('pokémon')) score += 1;
    if (nameLower.includes('magic') || nameLower.includes('yugioh')) score += 1;
    if (nameLower.includes('lego')) score += 1;
    if (nameLower.includes('puzzle')) score += 0.5;
    if (nameLower.includes('gioco') || nameLower.includes('tavolo')) score += 0.5;

    // Aggiungi varietà per evitare sempre gli stessi risultati
    score = addVariety(score, p.id);

    // Motivi più dettagliati e specifici
    const reasons: string[] = [];
    if (withinPrice && price) reasons.push(`Perfetto per il tuo budget (${price.toFixed(2)}€)`);
    if (p.stock_status === "instock") reasons.push("Disponibile per spedizione immediata");
    if (tagMatch) reasons.push("Corrisponde esattamente alle tue preferenze");
    if (nameScore >= 1) reasons.push("Match perfetto con le tue ricerche");
    if (p.featured) reasons.push("Prodotto consigliato dal negozio");
    if (nameLower.includes('starter') || nameLower.includes('principianti')) reasons.push("Ideale per iniziare");
    if (nameLower.includes('booster') || nameLower.includes('espansione')) reasons.push("Perfetto per espandere la collezione");
    
    // Se non ci sono motivi specifici, aggiungi motivi generici
    if (reasons.length === 0) {
      reasons.push("Prodotto di qualità selezionato per te");
      if (price && price < 20) reasons.push("Ottimo rapporto qualità-prezzo");
      if (price && price > 50) reasons.push("Prodotto premium di alta qualità");
    }

    const addToCartUrl = `${PUBLIC_BASE}/?add-to-cart=${p.id}`;

    return {
      id: p.id,
      name: p.name,
      price,
      image: p.images?.[0]?.src ?? null,
      permalink: p.permalink,
      addToCartUrl,
      score,
      reasons: reasons.slice(0, 3), // Massimo 3 motivi
    };
  });

  // Ordina per punteggio ma con un po' di randomizzazione per i prodotti con punteggio simile
  return rankedProducts.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    // Se la differenza di punteggio è piccola (< 0.5), aggiungi un po' di casualità
    if (Math.abs(scoreDiff) < 0.5) {
      return Math.random() - 0.5;
    }
    return scoreDiff;
  });
}
