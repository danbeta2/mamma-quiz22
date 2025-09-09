import { NextResponse } from "next/server";
import { buildIntentFromAnswers } from "@/lib/openai";
import { searchProducts, rankProducts } from "@/lib/woo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

export type Answer = {
  question: string;
  answer: string;
};

export type LLMIntent = {
  search_terms: string[];
  tags: string[];
  min_price?: number;
  max_price?: number;
  rationale: string;
};

// Helper function per formattare le risposte
function formatAnswers(answers: Answer[]): string {
  return answers.map((a: Answer) => `Q: "${a.question}"\nA: "${a.answer}"`).join('\n\n');
}

// Supporta sia il formato vecchio che quello nuovo
function isValidAnswers(a: any): boolean {
  if (!a) return false;
  
  // Formato nuovo (dinamico)
  if (Array.isArray(a)) {
    return a.every(item => 
      typeof item === 'object' && 
      typeof item.question === 'string' && 
      typeof item.answer === 'string'
    );
  }
  
  // Formato vecchio (statico) - per compatibilità
  if (typeof a === "object") {
    const okAge = ["0-6m","6-12m","1-3y","3-6y","6+y"].includes(a.ageRange);
    const okGoal = ["risparmio","sostenibilità","comodità","scorta","regalo"].includes(a.goal);
    const okUsage = ["basso","medio","alto"].includes(a.usage);
    const okBudget = ["<20","20-40","40-80","80+"].includes(a.budgetBand);
    const okUrgency = ["oggi","2-3gg","settimana"].includes(a.urgency);
    const okMaterials = Array.isArray(a.materials);
    return okAge && okGoal && okUsage && okBudget && okUrgency && okMaterials;
  }
  
  return false;
}

// Fallback intelligente per giochi e TCG
function buildFallbackIntent(answers: Answer[]): LLMIntent {
  const search_terms: string[] = [];
  const tags: string[] = [];
  let min_price: number | undefined;
  let max_price: number | undefined;
  let rationale = "Ho selezionato questi prodotti in base alle tue preferenze di gioco";
  
  // Analizza le risposte per estrarre informazioni
  answers.forEach(a => {
    const answer = a.answer.toLowerCase();
    const question = a.question.toLowerCase();
    
    // Età - focus su giochi appropriati
    if (question.includes("età")) {
      if (answer.includes("3-6")) {
        search_terms.push("giochi", "bambini", "3-6anni", "educativi", "puzzle");
        tags.push("3-6anni", "educativi");
        rationale = "Giochi perfetti per bambini di 3-6 anni";
      } else if (answer.includes("7-10")) {
        search_terms.push("giochi", "carte", "7-10anni", "strategici", "costruzioni");
        tags.push("7-10anni", "strategici");
        rationale = "Giochi ideali per bambini di 7-10 anni";
      } else if (answer.includes("11-14")) {
        search_terms.push("carte", "tcg", "giochi", "tavolo", "strategici");
        tags.push("11-14anni", "avanzati");
        rationale = "Giochi perfetti per ragazzi di 11-14 anni";
      } else if (answer.includes("15+") || answer.includes("adulto")) {
        search_terms.push("carte", "tcg", "magic", "pokemon", "strategici", "competitivi");
        tags.push("adulto", "competitivo");
        rationale = "Giochi e carte per giocatori esperti";
      }
    }
    
    // Tipo di gioco
    if (question.includes("tipo") || question.includes("gioco") || question.includes("categoria")) {
      if (answer.includes("carte") || answer.includes("tcg")) {
        search_terms.push("carte", "tcg", "pokemon", "magic", "yugioh", "starter", "booster");
        tags.push("tcg", "carte");
        rationale = "Carte collezionabili selezionate per te";
      } else if (answer.includes("tavolo")) {
        search_terms.push("giochi", "tavolo", "strategici", "famiglia", "party");
        tags.push("tavolo", "strategici");
        rationale = "Giochi da tavolo per divertimento garantito";
      } else if (answer.includes("puzzle") || answer.includes("costruzioni")) {
        search_terms.push("puzzle", "costruzioni", "lego", "educativi", "creativi");
        tags.push("costruzioni", "creativi");
        rationale = "Puzzle e costruzioni per sviluppare creatività";
      } else if (answer.includes("action")) {
        search_terms.push("action", "figures", "personaggi", "collezione");
        tags.push("action-figures", "collezione");
        rationale = "Action figures di qualità per la tua collezione";
      }
    }
    
    // Marca specifica
    if (question.includes("marca") || question.includes("brand")) {
      if (answer.includes("pokemon") || answer.includes("pokémon")) {
        search_terms.push("pokemon", "carte", "tcg", "starter", "booster", "deck");
        tags.push("pokemon", "tcg");
        rationale = "Prodotti Pokémon originali e di qualità";
      } else if (answer.includes("magic")) {
        search_terms.push("magic", "gathering", "carte", "booster", "planeswalker");
        tags.push("magic", "competitivo");
        rationale = "Magic: The Gathering per veri strateghi";
      } else if (answer.includes("yugioh") || answer.includes("yu-gi-oh")) {
        search_terms.push("yugioh", "carte", "duelist", "structure", "deck");
        tags.push("yugioh", "duelist");
        rationale = "Yu-Gi-Oh! per duellanti appassionati";
      }
    }
    
    // Budget - parsing specifico per giochi
    if (question.includes("budget") || question.includes("prezzo")) {
      if (answer.includes("15€") || answer.includes("15")) {
        max_price = 15;
      } else if (answer.includes("15-30")) {
        min_price = 15; max_price = 30;
      } else if (answer.includes("30-60")) {
        min_price = 30; max_price = 60;
      } else if (answer.includes("60-100")) {
        min_price = 60; max_price = 100;
      } else if (answer.includes("oltre") || answer.includes("100")) {
        min_price = 100;
      }
    }
    
    // Livello di esperienza
    if (question.includes("livello") || question.includes("esperienza")) {
      if (answer.includes("principiante")) {
        search_terms.push("principianti", "starter", "facile", "tutorial");
        tags.push("principiante", "facile");
      } else if (answer.includes("intermedio")) {
        search_terms.push("intermedio", "strategico", "avanzato");
        tags.push("intermedio");
      } else if (answer.includes("esperto") || answer.includes("competitivo")) {
        search_terms.push("competitivo", "torneo", "professionale", "avanzato");
        tags.push("competitivo", "esperto");
      }
    }
  });
  
  // Se non abbiamo termini specifici, usa termini per giochi generici
  if (search_terms.length === 0) {
    search_terms.push("giochi", "carte", "tcg", "puzzle", "tavolo", "educativi");
  }
  
  // Assicurati di avere almeno alcuni tag
  if (tags.length === 0) {
    tags.push("giochi", "divertimento", "qualità");
  }
  
  return {
    search_terms: search_terms.slice(0, 10), // Più termini per giochi specifici
    tags: tags.slice(0, 8),
    min_price,
    max_price,
    rationale: rationale + ". Prodotti selezionati per qualità e divertimento garantito."
  };
}

async function buildIntentFromDynamicAnswers(answers: Answer[]): Promise<LLMIntent> {
  try {
    if (!OPENAI_API_KEY) throw new Error("No OpenAI key");

    const prompt = `
Sei un esperto analista di prodotti per un e-commerce specializzato in giochi, TCG e giocattoli. Analizza le risposte del questionario e genera un intent di ricerca ottimizzato per trovare i prodotti perfetti.

RISPOSTE UTENTE ANALIZZATE:
${formatAnswers(answers)}

DATABASE PRODOTTI DISPONIBILI:
- Carte collezionabili: Pokémon (starter deck, booster, singole), Yu-Gi-Oh! (structure deck, booster), Magic (commander, standard, draft), Dragon Ball Super, One Piece
- Giochi da tavolo: Monopoly, Risiko, Catan, Ticket to Ride, Azul, Splendor, party games
- Puzzle: Ravensburger (500-5000 pz), LEGO (Creator, Technic, Architecture), 3D puzzles
- Action figures: Funko Pop, Dragon Ball, Naruto, Marvel, DC Comics
- Giocattoli educativi: LEGO Education, robotica, esperimenti scientifici

FASCE PREZZO TIPICHE:
- Starter deck TCG: 15-25€
- Booster pack: 3-5€
- Booster box: 80-120€
- Giochi da tavolo: 20-60€
- LEGO set: 10-300€
- Action figures: 10-50€
- Puzzle: 8-40€

COMPITO: Genera termini di ricerca SPECIFICI e EFFICACI per il motore di ricerca del negozio.

REGOLE ANALISI:
1. ESTRAI informazioni chiave: età, categoria, marca, budget, livello esperienza
2. TRADUCI in termini di ricerca che matchino i prodotti reali
3. INCLUDI sinonimi e varianti (es: "tcg" + "carte" + "collezionabili")
4. CONSIDERA la terminologia del settore (starter, booster, deck, set, etc.)
5. ADATTA il budget alle fasce reali dei prodotti
6. SCRIVI rationale personalizzato e convincente

ESEMPI DI SEARCH_TERMS OTTIMALI:
- TCG Pokémon principiante: ["pokemon", "starter", "deck", "principianti", "carte", "tcg", "base"]
- Magic competitivo: ["magic", "gathering", "booster", "competitivo", "torneo", "standard", "commander"]
- LEGO bambini: ["lego", "creator", "bambini", "costruzioni", "mattoncini", "set"]
- Giochi famiglia: ["giochi", "tavolo", "famiglia", "party", "strategici", "cooperativi"]

FORMATO RISPOSTA RICHIESTO (JSON valido):
{
  "search_terms": ["termine1", "termine2", "termine3", "termine4", "termine5", "termine6"],
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "min_price": numero_o_null,
  "max_price": numero_o_null,
  "rationale": "Messaggio personalizzato e convincente di 1-2 frasi che spiega perché questi prodotti sono perfetti per l'utente"
}

IMPORTANTE: Restituisci SOLO il JSON valido, nessun altro testo.
`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);

    const data: any = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";

    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    const json = start >= 0 && end > start ? text.slice(start, end + 1) : "{}";
    const parsed = JSON.parse(json);
    return parsed as LLMIntent;
  } catch (error) {
    console.log("OpenAI fallback for intent generation:", error);
    return buildFallbackIntent(answers);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const answers = body?.answers;

    if (!isValidAnswers(answers)) {
      return NextResponse.json({ error: "Invalid or missing 'answers' payload" }, { status: 400 });
    }

    // 1) Intent da OpenAI (termini di ricerca, range prezzo, rationale)
    const intent = Array.isArray(answers) 
      ? await buildIntentFromDynamicAnswers(answers)
      : await buildIntentFromAnswers(answers); // Fallback per formato vecchio

    // 2) Prodotti da WooCommerce REST (autenticata con ck/cs via server)
    const products = await searchProducts({
      searchTerms: intent.search_terms || [],
      minPrice: intent.min_price,
      maxPrice: intent.max_price,
      perPage: 50,
    });

    // 3) Ranking locale e top 3
    const ranked = rankProducts(products, {
      searchTerms: intent.search_terms || [],
      tags: intent.tags || [],
      minPrice: intent.min_price,
      maxPrice: intent.max_price,
    });

    const recommendations = ranked.slice(0, 3);

    return NextResponse.json({
      rationale: intent.rationale,
      recommendations,
      meta: {
        total_found: products.length,
        searched_terms: intent.search_terms || [],
        price_range: { min: intent.min_price ?? null, max: intent.max_price ?? null },
      },
    });
  } catch (err: any) {
    console.error("API /recommend error:", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message ?? "unknown" },
      { status: 500 }
    );
  }
}
