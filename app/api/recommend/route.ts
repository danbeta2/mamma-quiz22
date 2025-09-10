import { NextResponse } from "next/server";
import { buildIntentFromAnswers } from "@/lib/openai";
import { searchProducts, rankProducts } from "@/lib/woo";

// Force Vercel rebuild - TypeScript fix applied
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

    const answersText = formatAnswers(answers);
    
    const prompt = "Sei un esperto analista di prodotti per un e-commerce specializzato in giochi, TCG e giocattoli. Analizza le risposte del questionario e genera un intent di ricerca ottimizzato per trovare i prodotti perfetti.\n\n" +
      "RISPOSTE UTENTE ANALIZZATE:\n" + answersText + "\n\n" +
      "DATABASE PRODOTTI DISPONIBILI:\n" +
      "- Carte collezionabili: Pokémon (starter deck, booster, singole), Yu-Gi-Oh! (structure deck, booster), Magic (commander, standard, draft), Dragon Ball Super, One Piece\n" +
      "- Giochi da tavolo: Monopoly, Risiko, Catan, Ticket to Ride, Azul, Splendor, party games\n" +
      "- Puzzle: Ravensburger (500-5000 pz), LEGO (Creator, Technic, Architecture), 3D puzzles\n" +
      "- Action figures: Funko Pop, Dragon Ball, Naruto, Marvel, DC Comics\n" +
      "- Giocattoli educativi: LEGO Education, robotica, esperimenti scientifici\n\n" +
      "FASCE PREZZO TIPICHE:\n" +
      "- Starter deck TCG: 15-25€\n" +
      "- Booster pack: 3-5€\n" +
      "- Booster box: 80-120€\n" +
      "- Giochi da tavolo: 20-60€\n" +
      "- LEGO set: 10-300€\n" +
      "- Action figures: 10-50€\n" +
      "- Puzzle: 8-40€\n\n" +
      "COMPITO: Genera termini di ricerca SPECIFICI e EFFICACI per il motore di ricerca del negozio.\n\n" +
      "REGOLE ANALISI:\n" +
      "1. ESTRAI informazioni chiave: età, categoria, marca, budget, livello esperienza\n" +
      "2. TRADUCI in termini di ricerca che matchino i prodotti reali\n" +
      "3. INCLUDI sinonimi e varianti (es: \"tcg\" + \"carte\" + \"collezionabili\")\n" +
      "4. CONSIDERA la terminologia del settore (starter, booster, deck, set, etc.)\n" +
      "5. ADATTA il budget alle fasce reali dei prodotti\n" +
      "6. SCRIVI rationale personalizzato e convincente\n\n" +
      "ESEMPI DI SEARCH_TERMS OTTIMALI:\n" +
      "- TCG Pokémon principiante: [\"pokemon\", \"starter\", \"deck\", \"principianti\", \"carte\", \"tcg\", \"base\"]\n" +
      "- Magic competitivo: [\"magic\", \"gathering\", \"booster\", \"competitivo\", \"torneo\", \"standard\", \"commander\"]\n" +
      "- LEGO bambini: [\"lego\", \"creator\", \"bambini\", \"costruzioni\", \"mattoncini\", \"set\"]\n" +
      "- Giochi famiglia: [\"giochi\", \"tavolo\", \"famiglia\", \"party\", \"strategici\", \"cooperativi\"]\n\n" +
      "FORMATO RISPOSTA RICHIESTO (JSON valido):\n" +
      "{\n" +
      "  \"search_terms\": [\"termine1\", \"termine2\", \"termine3\", \"termine4\", \"termine5\", \"termine6\"],\n" +
      "  \"tags\": [\"tag1\", \"tag2\", \"tag3\", \"tag4\"],\n" +
      "  \"min_price\": numero_o_null,\n" +
      "  \"max_price\": numero_o_null,\n" +
      "  \"rationale\": \"Messaggio personalizzato e convincente di 1-2 frasi che spiega perché questi prodotti sono perfetti per l'utente\"\n" +
      "}\n\n" +
      "IMPORTANTE: Restituisci SOLO il JSON valido, nessun altro testo.";

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

// Genera spiegazione dettagliata personalizzata per i prodotti scelti
async function generateDetailedRationale(answers: Answer[], recommendations: any[], intent: LLMIntent): Promise<string> {
  try {
    if (!OPENAI_API_KEY || recommendations.length === 0) {
      return intent.rationale || "Ho selezionato questi prodotti in base alle tue preferenze.";
    }

    const answersText = formatAnswers(answers);
    const productsText = recommendations.map((p, i) => 
      `${i + 1}. ${p.name} - ${p.price ? p.price.toFixed(2) + '€' : 'Prezzo da verificare'}\n   Motivi: ${p.reasons.join(', ')}`
    ).join('\n\n');

    const prompt = "Sei un consulente esperto specializzato in giochi, TCG e giocattoli con 15+ anni di esperienza. Hai appena completato un'analisi approfondita del profilo di un cliente e selezionato prodotti ultra-personalizzati.\n\n" +
      "PROFILO COMPLETO DEL CLIENTE:\n" + answersText + "\n\n" +
      "PRODOTTI SELEZIONATI CON ANALISI:\n" + productsText + "\n\n" +
      "🎯 COMPITO: Scrivi una spiegazione DETTAGLIATA e MOTIVATA (4-6 frasi) che dimostri la tua expertise e giustifichi ogni scelta con precisione scientifica.\n\n" +
      "📋 STRUTTURA RICHIESTA:\n" +
      "1. ANALISI PROFILO: Riassumi il profilo psicologico/preferenze del cliente\n" +
      "2. LOGICA SELEZIONE: Spiega il ragionamento dietro ogni prodotto scelto\n" +
      "3. BENEFICI SPECIFICI: Dettagli sui vantaggi per questo cliente specifico\n" +
      "4. CRESCITA FUTURA: Come questi prodotti supporteranno lo sviluppo\n\n" +
      "🔍 ELEMENTI DA INCLUDERE SEMPRE:\n" +
      "- Riferimenti specifici alle risposte del questionario\n" +
      "- Connessioni tra personalità e caratteristiche prodotto\n" +
      "- Benefici educativi/sviluppo competenze\n" +
      "- Valore a lungo termine dell'investimento\n" +
      "- Compatibilità con contesto familiare/sociale\n\n" +
      "💡 ESEMPI DI SPIEGAZIONI PROFESSIONALI:\n\n" +
      "ESEMPIO TCG: \"Basandomi sul profilo emerso - bambino di 9 anni con forte inclinazione strategica e desiderio di collezionismo - ho selezionato uno Starter Deck Pokémon che offre meccaniche bilanciate per sviluppare il pensiero tattico, abbinato a Booster Pack per soddisfare l'aspetto collezionistico. Questi prodotti sono ideali perché combinano l'apprendimento di regole complesse (sviluppo cognitivo) con la gratificazione immediata delle carte rare (motivazione intrinseca). Il budget di 35€ è ottimizzato per garantire un'esperienza completa senza sovraccarico, permettendo una progressione naturale verso formati più avanzati.\"\n\n" +
      "ESEMPIO GIOCHI TAVOLO: \"Considerando il profilo di una famiglia con bambini 8-12 anni che cerca esperienze collaborative e educative, ho scelto Ticket to Ride per sviluppare pianificazione strategica e geografia, e Azul per affinare il riconoscimento di pattern e l'estetica. Entrambi offrono meccaniche accessibili ma profonde, perfette per creare momenti di qualità familiare mentre stimolano competenze STEM. La combinazione garantisce varietà di esperienza (geografica vs artistica) e longevità di gioco, rappresentando un investimento formativo eccellente.\"\n\n" +
      "🎯 TONO: Professionale, competente, personalizzato, educativo ma accessibile.\n" +
      "📏 LUNGHEZZA: 6-8 frasi dense di contenuto, ogni parola deve aggiungere valore. Sii molto dettagliato e specifico.\n\n" +
      "🎯 REQUISITI AGGIUNTIVI:\n" +
      "- Spiega PERCHÉ ogni prodotto è perfetto per questo specifico profilo\n" +
      "- Includi benefici educativi e di sviluppo concreti\n" +
      "- Menziona come i prodotti si integrano tra loro\n" +
      "- Aggiungi consigli per massimizzare l'esperienza\n" +
      "- Usa terminologia tecnica appropriata del settore\n\n" +
      "Scrivi SOLO la spiegazione dettagliata e professionale:";

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!res.ok) throw new Error(`OpenAI error ${res.status}`);

    const data: any = await res.json();
    const explanation = data?.choices?.[0]?.message?.content?.trim() ?? "";

    return explanation || intent.rationale || "Ho selezionato questi prodotti in base alle tue preferenze specifiche.";
  } catch (error) {
    console.log("Fallback to basic rationale:", error);
    
    // Fallback intelligente basato sui prodotti e risposte
    const userAge = answers.find(a => a.question.toLowerCase().includes('età'))?.answer || '';
    const userCategory = answers.find(a => a.question.toLowerCase().includes('tipo') || a.question.toLowerCase().includes('categoria'))?.answer || '';
    const userBudget = answers.find(a => a.question.toLowerCase().includes('budget'))?.answer || '';
    
    let explanation = "Ho selezionato questi prodotti perché ";
    
    if (userAge) {
      explanation += `sono perfetti per l'età indicata (${userAge})`;
    }
    if (userCategory) {
      explanation += userAge ? ` e corrispondono alla categoria ${userCategory}` : `corrispondono alla categoria ${userCategory}`;
    }
    if (userBudget) {
      explanation += ` rispettando il tuo budget di ${userBudget}`;
    }
    
    explanation += ". Ogni prodotto è stato scelto per qualità e divertimento garantito.";
    
    return explanation;
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

    // 2) Prodotti da WooCommerce REST con strategia multipla per varietà
    let allProducts: any[] = [];
    
    // Prima ricerca: termini specifici
    const specificProducts = await searchProducts({
      searchTerms: intent.search_terms || [],
      minPrice: intent.min_price,
      maxPrice: intent.max_price,
      perPage: 30,
    });
    allProducts = [...specificProducts];
    
    // Seconda ricerca: termini più generici per varietà
    if (allProducts.length < 20) {
      const genericTerms = intent.search_terms?.length > 0 
        ? [intent.search_terms[0]] // Solo il primo termine
        : ["giochi", "carte", "tcg"];
        
      const genericProducts = await searchProducts({
        searchTerms: genericTerms,
        minPrice: intent.min_price,
        maxPrice: intent.max_price,
        perPage: 30,
      });
      
      // Aggiungi prodotti che non sono già presenti
      const existingIds = new Set(allProducts.map(p => p.id));
      const newProducts = genericProducts.filter(p => !existingIds.has(p.id));
      allProducts = [...allProducts, ...newProducts];
    }
    
    // Terza ricerca: completamente casuale se ancora pochi prodotti
    if (allProducts.length < 15) {
      const randomProducts = await searchProducts({
        searchTerms: [],
        perPage: 20,
      });
      
      const existingIds = new Set(allProducts.map(p => p.id));
      const newProducts = randomProducts.filter(p => !existingIds.has(p.id));
      allProducts = [...allProducts, ...newProducts];
    }

    // 3) Ranking locale con pool più ampio
    const ranked = rankProducts(allProducts, {
      searchTerms: intent.search_terms || [],
      tags: intent.tags || [],
      minPrice: intent.min_price,
      maxPrice: intent.max_price,
    });

    // Prendi i top 3 ma con più varietà
    const recommendations = ranked.slice(0, 3);

    // 4) Genera spiegazione dettagliata del perché sono stati scelti questi prodotti
    const detailedRationale = await generateDetailedRationale(Array.isArray(answers) ? answers : [], recommendations, intent);

    return NextResponse.json({
      rationale: detailedRationale,
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
