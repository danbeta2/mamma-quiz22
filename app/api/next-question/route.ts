import { NextResponse } from "next/server";

// Force Vercel rebuild - TypeScript fix applied - FINAL FIX - 2025-01-18
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

export type QuestionResponse = {
  question: string;
  options: string[];
  isComplete: boolean;
  rationale?: string;
};

export type Answer = {
  question: string;
  answer: string;
};

// Helper function per formattare le risposte
function formatAnswers(answers: Answer[]): string {
  return answers.map((a: Answer) => `Q: "${a.question}"\nA: "${a.answer}"`).join('\n\n');
}

// Sistema di domande specifiche per giochi e TCG con controllo rigoroso dei duplicati
function generateSmartQuestion(answers: Answer[]): { question: string; options: string[] } {
  // Traccia esattamente le domande già fatte per evitare duplicati
  const askedQuestions = answers.map((a: Answer) => a.question.toLowerCase().trim());
  
  // Funzione helper per verificare se una domanda simile è già stata fatta
  function isQuestionAlreadyAsked(keywords: string[]): boolean {
    return askedQuestions.some(q => keywords.some(keyword => q.includes(keyword)));
  }

  // Analizza le risposte per capire i topic coperti
  const answeredTopics = new Set(answers.map((a: Answer) => {
    const q = a.question.toLowerCase();
    const ans = a.answer.toLowerCase();
    
    if (q.includes("età") || q.includes("bambino") || q.includes("anni")) return "age";
    if (q.includes("budget") || q.includes("prezzo") || q.includes("spendere") || q.includes("costa")) return "budget";
    if (q.includes("tipo") || q.includes("categoria") || q.includes("gioco") || q.includes("carte") || q.includes("prodotto")) return "category";
    if (q.includes("marca") || q.includes("brand") || q.includes("preferisci") || ans.includes("pokémon") || ans.includes("yu-gi-oh")) return "brand";
    if (q.includes("livello") || q.includes("difficoltà") || q.includes("esperienza") || q.includes("principiante")) return "level";
    if (q.includes("fratelli") || q.includes("sorelle") || q.includes("famiglia") || q.includes("bambini")) return "family";
    if (q.includes("occasione") || q.includes("regalo") || q.includes("quando")) return "occasion";
    if (q.includes("competitivo") || q.includes("stile") || q.includes("modalità")) return "style";
    return "other";
  }));

  // 1. Prima domanda: età (solo se non già chiesta)
  if (!isQuestionAlreadyAsked(["età", "anni", "bambino", "vecchio"])) {
    return {
      question: "Per quale fascia d'età stai cercando?",
      options: ["3-6 anni", "7-10 anni", "11-14 anni", "15+ anni", "Adulto"]
    };
  }

  // 2. Contesto familiare (domanda specifica richiesta)
  if (!isQuestionAlreadyAsked(["fratelli", "sorelle", "famiglia", "bambini", "figli"])) {
    return {
      question: "Quanti bambini/ragazzi giocheranno insieme?",
      options: ["Solo uno", "2 bambini (fratelli/sorelle)", "3-4 bambini", "Gruppo più grande", "Tutta la famiglia"]
    };
  }

  // 3. Categoria di gioco
  if (!isQuestionAlreadyAsked(["tipo", "categoria", "gioco", "prodotto", "interessa"])) {
    return {
      question: "Che tipo di gioco/prodotto ti interessa?",
      options: ["Carte collezionabili (TCG)", "Giochi da tavolo", "Puzzle e costruzioni", "Action figures", "Giocattoli educativi"]
    };
  }

  // 4. Occasione d'uso
  if (!isQuestionAlreadyAsked(["occasione", "regalo", "quando", "momento"])) {
    return {
      question: "Per quale occasione?",
      options: ["Compleanno", "Regalo di Natale", "Uso quotidiano", "Occasione speciale", "Collezionismo"]
    };
  }

  // 5. Budget
  if (!isQuestionAlreadyAsked(["budget", "prezzo", "spendere", "costa", "euro"])) {
    return {
      question: "Qual è il tuo budget indicativo?",
      options: ["Fino a 15€", "15-30€", "30-60€", "60-100€", "Oltre 100€"]
    };
  }

  // Domande specifiche basate sulla categoria scelta
  const categoryAnswer = answers.find(a => 
    a.question.toLowerCase().includes("tipo") || 
    a.question.toLowerCase().includes("gioco") ||
    a.question.toLowerCase().includes("prodotto")
  )?.answer || "";
  
  // Domande specifiche per TCG
  if (categoryAnswer.includes("Carte") || categoryAnswer.includes("TCG")) {
    if (!isQuestionAlreadyAsked(["marca", "brand", "carte", "preferisci"])) {
      return {
        question: "Quale marca di carte collezionabili preferisci?",
        options: ["Pokémon", "Yu-Gi-Oh!", "Magic: The Gathering", "Dragon Ball Super", "One Piece", "Non ho preferenze"]
      };
    }
    
    if (!isQuestionAlreadyAsked(["livello", "esperienza", "principiante", "esperto"])) {
      return {
        question: "Qual è il livello di esperienza con i TCG?",
        options: ["Principiante (prime carte)", "Intermedio (conosco le regole)", "Esperto (gioco regolarmente)", "Competitivo (tornei)"]
      };
    }
  }

  // Domande per giochi da tavolo
  if (categoryAnswer.includes("tavolo")) {
    if (!isQuestionAlreadyAsked(["stile", "modalità", "preferisci", "tipo"])) {
      return {
        question: "Che stile di gioco da tavolo preferisci?",
        options: ["Strategico", "Cooperativo", "Party game", "Famiglia", "Avventura/Tematico"]
      };
    }
  }

  // Domanda finale di priorità
  if (!isQuestionAlreadyAsked(["importante", "priorità", "preferenza", "valore"])) {
    return {
      question: "Cosa è più importante per te?",
      options: ["Qualità premium", "Miglior prezzo", "Novità/ultime uscite", "Classici intramontabili", "Facilità di apprendimento"]
    };
  }

  // Fallback se tutte le domande sono state fatte
  return {
    question: "C'è qualcos'altro di specifico che stai cercando?",
    options: ["Edizione limitata", "Set per principianti", "Espansioni/accessori", "Regalo sorpresa", "Consiglio dell'esperto"]
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { answers = [], context = "" } = body;

    // Se abbiamo abbastanza risposte, completa il quiz
    if (answers.length >= 7) {
      return NextResponse.json({
        question: "",
        options: [],
        isComplete: true,
        rationale: "Perfetto! Ho raccolto tutte le informazioni necessarie per fornirti consigli personalizzati e dettagliati."
      });
    }

    // Genera domanda intelligente basata sulle risposte precedenti
    const smartQuestion = generateSmartQuestion(answers);

    // Prova prima OpenAI, poi fallback
    try {
      if (!OPENAI_API_KEY) {
        console.log("⚠️ OPENAI_API_KEY not found, using fallback");
        throw new Error("No OpenAI key");
      }

      console.log("✅ Using OpenAI for question generation");
      console.log("🔑 API Key present:", OPENAI_API_KEY ? `${OPENAI_API_KEY.substring(0, 10)}...` : "MISSING");
      const contextText = context || "E-commerce specializzato in giochi, TCG, carte collezionabili, giocattoli, puzzle, action figures";
      const answersText = formatAnswers(answers);
      
      const prompt = "Sei un consulente esperto specializzato in giochi, TCG, carte collezionabili e giocattoli. Il tuo obiettivo è creare un questionario APPROFONDITO e VERTICALE per fornire consigli ultra-personalizzati.\n\n" +
        "CONTESTO NEGOZIO: " + contextText + "\n\n" +
        "CRONOLOGIA DOMANDE GIÀ FATTE:\n" + answersText + "\n\n" +
        "🚫 REGOLA ASSOLUTA: NON RIPETERE MAI domande già fatte sopra, nemmeno con parole diverse!\n\n" +
        "TEMI GIÀ TRATTATI (DA EVITARE):\n" +
        (answers.map((a: Answer) => `❌ ${a.question}`).join('\n') || "- Nessuna domanda ancora fatta") + "\n\n" +
        "🎯 STRATEGIA QUESTIONARIO VERTICALE (7-8 domande totali):\n" +
        "1. DEMOGRAFIA: Età precisa, genere, personalità del bambino\n" +
        "2. CONTESTO SOCIALE: Fratelli, amici, dinamiche familiari\n" +
        "3. CATEGORIA PRINCIPALE: Tipo di prodotto con sottocategorie specifiche\n" +
        "4. ESPERIENZA PREGRESSA: Cosa possiede già, cosa ha funzionato/non funzionato\n" +
        "5. PREFERENZE SPECIFICHE: Temi, personaggi, meccaniche di gioco preferite\n" +
        "6. OBIETTIVI EDUCATIVI: Cosa vuoi sviluppare (creatività, logica, socialità)\n" +
        "7. BUDGET E PRIORITÀ: Range di prezzo e cosa è più importante\n" +
        "8. DETTAGLI FINALI: Occasione, urgenza, preferenze estetiche\n\n" +
        "🔍 DOMANDE ULTRA-SPECIFICHE PER CATEGORIA:\n\n" +
        "📱 TCG/CARTE COLLEZIONABILI:\n" +
        "- \"Quale aspetto delle carte lo attrae di più?\" [Collezionare, Giocare competitivo, Arte/design, Scambiare con amici]\n" +
        "- \"Che tipo di mazzi preferisce?\" [Aggressivi/veloci, Strategici/controllo, Combo complesse, Tematici/narrativi]\n" +
        "- \"Quanto tempo dedica al gioco?\" [30min occasionali, 1-2h weekend, Tornei regolari, Collezionismo quotidiano]\n" +
        "- \"Che formato di gioco interessa?\" [Standard competitivo, Casual kitchen table, Draft/sealed, Solo collezionismo]\n\n" +
        "🎲 GIOCHI DA TAVOLO:\n" +
        "- \"Che tipo di sfida mentale preferisce?\" [Strategia pura, Deduzione/mistero, Gestione risorse, Cooperazione]\n" +
        "- \"Quale atmosfera di gioco cerca?\" [Competitiva intensa, Rilassata familiare, Narrativa immersiva, Party divertente]\n" +
        "- \"Quanto tempo ha per giocare?\" [15-30min veloci, 1h medi, 2h+ epici, Variabile]\n" +
        "- \"Che meccaniche lo coinvolgono?\" [Dadi e fortuna, Carte e combo, Piazzamento tessere, Negoziazione]\n\n" +
        "🧩 COSTRUZIONI/PUZZLE:\n" +
        "- \"Che tipo di costruzione preferisce?\" [Seguire istruzioni precise, Creazione libera, Modificare set esistenti, Inventare da zero]\n" +
        "- \"Quale tema lo appassiona?\" [Veicoli/mezzi, Architetture/città, Personaggi/creature, Meccanismi funzionanti]\n" +
        "- \"Che livello di dettaglio cerca?\" [Semplice e veloce, Medio dettaglio, Ultra-dettagliato, Modulare/espandibile]\n\n" +
        "🎭 ACTION FIGURES/COLLECTIBLES:\n" +
        "- \"Come interagisce con le figure?\" [Gioco narrativo, Esposizione/collezione, Personalizzazione, Stop-motion/foto]\n" +
        "- \"Che universi narrativi ama?\" [Anime/manga, Supereroi, Sci-fi/fantasy, Horror/dark, Slice of life]\n" +
        "- \"Che caratteristiche sono prioritarie?\" [Articolazione estrema, Dettagli scultura, Accessori inclusi, Rarità/esclusività]\n\n" +
        "🧠 GIOCATTOLI EDUCATIVI:\n" +
        "- \"Quale area vuoi sviluppare?\" [STEM/logica, Creatività artistica, Abilità motorie, Competenze sociali]\n" +
        "- \"Che approccio all'apprendimento preferisce?\" [Sperimentazione libera, Progetti guidati, Sfide progressive, Gioco collaborativo]\n" +
        "- \"Quanto supporto adulto è disponibile?\" [Autonomia totale, Supervisione occasionale, Collaborazione attiva, Guida costante]\n\n" +
        "💡 ESEMPI DI DOMANDE VERTICALI PERFETTE:\n" +
        "- \"Quando gioca con le carte, cosa lo entusiasma di più: vincere partite, scoprire carte rare, o creare strategie elaborate?\"\n" +
        "- \"Nei giochi da tavolo, preferisce essere il leader che guida la strategia o il tattico che trova soluzioni creative?\"\n" +
        "- \"Con i LEGO, tende a seguire le istruzioni alla lettera o a modificare e personalizzare i set?\"\n" +
        "- \"Quale di questi aspetti è più importante: che il gioco duri a lungo nel tempo, che sia facile da imparare, o che offra sempre nuove sfide?\"\n\n" +
        "📋 ISTRUZIONI OPERATIVE:\n" +
        "1. ANALIZZA le risposte precedenti per capire il profilo\n" +
        "2. IDENTIFICA l'area che necessita maggiore approfondimento\n" +
        "3. CREA una domanda SPECIFICA e VERTICALE per quella area\n" +
        "4. EVITA domande generiche - vai sempre nel dettaglio\n" +
        "5. OPZIONI: 4-5 scelte molto specifiche e distintive\n" +
        "6. Se hai 7+ risposte dettagliate, completa il quiz\n\n" +
        "FORMATO RISPOSTA (JSON):\n" +
        "{\n" +
        "  \"question\": \"Domanda specifica e verticale MAI fatta prima\",\n" +
        "  \"options\": [\"Opzione molto specifica 1\", \"Opzione molto specifica 2\", \"Opzione molto specifica 3\", \"Opzione molto specifica 4\"],\n" +
        "  \"isComplete\": false\n" +
        "}\n\n" +
        "🎯 OBIETTIVO: Ogni domanda deve rivelare un aspetto UNICO della personalità e preferenze del cliente per consigli ULTRA-PERSONALIZZATI!";

      console.log("🚀 Making OpenAI API call...");
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
        }),
      });

      console.log("📡 OpenAI response status:", res.status);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.log("❌ OpenAI error response:", errorText);
        throw new Error(`OpenAI error ${res.status}: ${errorText}`);
      }

      const data: any = await res.json();
      console.log("✅ OpenAI response received");
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      console.log("📝 OpenAI generated text:", text.substring(0, 100) + "...");

      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const json = start >= 0 && end > start ? text.slice(start, end + 1) : "{}";
      const parsed = JSON.parse(json);

      console.log("🎯 Using OpenAI generated question");
      return NextResponse.json(parsed as QuestionResponse);
    } catch (openaiError) {
      console.log("OpenAI fallback, using predefined questions:", openaiError);
      
      // Fallback a domande intelligenti
      return NextResponse.json({
        question: smartQuestion.question,
        options: smartQuestion.options,
        isComplete: false,
        rationale: undefined
      });
    }
  } catch (err: any) {
    console.error("API /next-question error:", err);
    return NextResponse.json(
      { error: "Server error", details: err?.message ?? "unknown" },
      { status: 500 }
    );
  }
}
// Trigger Vercel redeploy - Tue Sep  9 15:37:20 CEST 2025
