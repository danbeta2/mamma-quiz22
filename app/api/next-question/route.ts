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
    if (answers.length >= 4) {
      return NextResponse.json({
        question: "",
        options: [],
        isComplete: true,
        rationale: "Perfetto! Ho abbastanza informazioni per consigliarti i prodotti migliori."
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
      const contextText = context || "E-commerce specializzato in giochi, TCG, carte collezionabili, giocattoli, puzzle, action figures";
      const answersText = formatAnswers(answers);
      
      const prompt = "Sei un esperto consulente di giochi, carte collezionabili (TCG), giocattoli e prodotti per bambini/ragazzi.\n\n" +
        "CONTESTO NEGOZIO: " + contextText + "\n\n" +
        "CRONOLOGIA COMPLETA DOMANDE GIÀ FATTE:\n" + answersText + "\n\n" +
        "⚠️ REGOLA CRITICA: ANALIZZA OGNI SINGOLA DOMANDA GIÀ FATTA SOPRA. NON RIPETERE MAI NESSUNA DOMANDA SIMILE, NEMMENO CON PAROLE DIVERSE!\n\n" +
        "TEMI GIÀ TRATTATI DA EVITARE ASSOLUTAMENTE:\n" +
        (answers.map((a: Answer) => `- ${a.question}`).join('\n') || "- Nessuna domanda ancora fatta") + "\n\n" +
        "SEQUENZA LOGICA OBBLIGATORIA (salta se già trattato):\n" +
        "1. ETÀ: \"Per quale fascia d'età stai cercando?\"\n" +
        "2. CONTESTO: \"Quanti bambini/ragazzi giocheranno insieme?\"\n" +
        "3. CATEGORIA: \"Che tipo di prodotto ti interessa?\"\n" +
        "4. OCCASIONE: \"Per quale occasione?\"\n" +
        "5. BUDGET: \"Qual è il tuo budget indicativo?\"\n" +
        "6. SPECIFICHE: domande mirate per categoria scelta\n\n" +
        "CATEGORIE PRODOTTI:\n" +
        "- Carte collezionabili: Pokémon, Yu-Gi-Oh!, Magic, Dragon Ball Super, One Piece\n" +
        "- Giochi da tavolo: strategici, cooperativi, party games, famiglia\n" +
        "- Puzzle e costruzioni: LEGO, Ravensburger, 3D puzzles\n" +
        "- Action figures: anime, supereroi, gaming\n" +
        "- Giocattoli educativi: STEM, robotica, esperimenti\n\n" +
        "DOMANDE SPECIFICHE PER CATEGORIA (solo se categoria già scelta):\n" +
        "- TCG: marca preferita, livello esperienza, tipo di prodotto (starter/booster/singole)\n" +
        "- Giochi tavolo: stile (strategico/cooperativo/party), numero giocatori, durata\n" +
        "- LEGO: tema preferito, dimensione set, età costruttore\n" +
        "- Action figures: franchise preferito, dimensione, articolazione\n\n" +
        "ISTRUZIONI OPERATIVE:\n" +
        "1. LEGGI ATTENTAMENTE tutte le domande già fatte sopra\n" +
        "2. IDENTIFICA quale tema NON è ancora stato trattato\n" +
        "3. FAI la prossima domanda logica nella sequenza\n" +
        "4. Se hai 5+ risposte complete, imposta isComplete: true\n" +
        "5. OPZIONI: 4-6 scelte chiare e specifiche\n\n" +
        "ESEMPI DI PROGRESSIONE CORRETTA:\n" +
        "- Se non hai età → chiedi età\n" +
        "- Se hai età ma non contesto → chiedi quanti bambini\n" +
        "- Se hai età+contesto ma non categoria → chiedi tipo prodotto\n" +
        "- Se hai categoria TCG ma non marca → chiedi marca carte\n" +
        "- Se hai tutto → isComplete: true\n\n" +
        "FORMATO RISPOSTA (JSON puro):\n" +
        "{\n" +
        "  \"question\": \"Domanda NON ancora fatta\",\n" +
        "  \"options\": [\"Opzione 1\", \"Opzione 2\", \"Opzione 3\", \"Opzione 4\"],\n" +
        "  \"isComplete\": false,\n" +
        "  \"rationale\": \"Solo se isComplete=true\"\n" +
        "}\n\n" +
        "⚠️ VERIFICA FINALE: La domanda che stai per fare è DIVERSA da tutte quelle già fatte sopra? Se no, scegli un altro tema!";

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

      if (!res.ok) throw new Error(`OpenAI error ${res.status}`);

      const data: any = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";

      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      const json = start >= 0 && end > start ? text.slice(start, end + 1) : "{}";
      const parsed = JSON.parse(json);

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
