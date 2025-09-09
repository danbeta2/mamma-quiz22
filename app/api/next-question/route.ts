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

// Sistema di domande specifiche per giochi e TCG
function generateSmartQuestion(answers: Answer[]): { question: string; options: string[] } {
  const answeredTopics = new Set(answers.map((a: Answer) => {
    const q = a.question.toLowerCase();
    if (q.includes("età") || q.includes("bambino")) return "age";
    if (q.includes("budget") || q.includes("prezzo") || q.includes("spendere")) return "budget";
    if (q.includes("tipo") || q.includes("categoria") || q.includes("gioco") || q.includes("carte")) return "category";
    if (q.includes("marca") || q.includes("brand")) return "brand";
    if (q.includes("livello") || q.includes("difficoltà") || q.includes("esperienza")) return "level";
    if (q.includes("competitivo") || q.includes("stile")) return "style";
    return "other";
  }));

  // Evita di ripetere domande già fatte
  const askedQuestions = answers.map((a: Answer) => a.question.toLowerCase());
  
  // Prima domanda: età (solo se non già chiesta)
  if (!answeredTopics.has("age") && !askedQuestions.some(q => q.includes("età") || q.includes("bambino"))) {
    return {
      question: "Per che età stai cercando?",
      options: ["3-6 anni", "7-10 anni", "11-14 anni", "15+ anni", "Adulto"]
    };
  }

  // Seconda: categoria di gioco
  if (!answeredTopics.has("category")) {
    return {
      question: "Che tipo di gioco ti interessa?",
      options: ["Carte collezionabili (TCG)", "Giochi da tavolo", "Puzzle e costruzioni", "Action figures", "Giocattoli educativi"]
    };
  }

  // Terza: budget
  if (!answeredTopics.has("budget")) {
    return {
      question: "Qual è il tuo budget?",
      options: ["Fino a 15€", "15-30€", "30-60€", "60-100€", "Oltre 100€"]
    };
  }

  // Domande specifiche per TCG
  const categoryAnswer = answers.find(a => a.question.toLowerCase().includes("tipo") || a.question.toLowerCase().includes("gioco"))?.answer || "";
  
  if (categoryAnswer.includes("Carte") || categoryAnswer.includes("TCG")) {
    if (!answeredTopics.has("brand")) {
      return {
        question: "Quale marca di carte preferisci?",
        options: ["Pokémon", "Yu-Gi-Oh!", "Magic: The Gathering", "Dragon Ball Super", "Non ho preferenze"]
      };
    }
    
    if (!answeredTopics.has("level")) {
      return {
        question: "Qual è il tuo livello di esperienza?",
        options: ["Principiante", "Intermedio", "Esperto", "Competitivo"]
      };
    }
  }

  // Domande per giochi da tavolo
  if (categoryAnswer.includes("tavolo")) {
    if (!answeredTopics.has("style")) {
      return {
        question: "Che stile di gioco preferisci?",
        options: ["Strategico", "Cooperativo", "Party game", "Famiglia", "Avventura"]
      };
    }
  }

  // Domanda finale
  return {
    question: "Cosa è più importante per te?",
    options: ["Qualità premium", "Miglior prezzo", "Novità/ultime uscite", "Classici intramontabili", "Facilità di apprendimento"]
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
      if (!OPENAI_API_KEY) throw new Error("No OpenAI key");

      const contextText = context || "E-commerce specializzato in giochi, TCG, carte collezionabili, giocattoli, puzzle, action figures";
      const answersText = formatAnswers(answers);
      
      const prompt = "Sei un esperto consulente di giochi, carte collezionabili (TCG), giocattoli e prodotti per bambini/ragazzi. Il tuo obiettivo è creare un questionario progressivo e intelligente per consigliare i prodotti perfetti.\n\n" +
        "CONTESTO NEGOZIO: " + contextText + "\n\n" +
        "RISPOSTE PRECEDENTI DELL'UTENTE:\n" + answersText + "\n\n" +
        "CATEGORIE PRODOTTI DISPONIBILI:\n" +
        "- Carte collezionabili: Pokémon, Yu-Gi-Oh!, Magic: The Gathering, Dragon Ball Super, One Piece\n" +
        "- Giochi da tavolo: strategici, cooperativi, party games, famiglia\n" +
        "- Puzzle e costruzioni: LEGO, Ravensburger, 3D puzzles\n" +
        "- Action figures e collectibles: anime, supereroi, gaming\n" +
        "- Giocattoli educativi: STEM, robotica, esperimenti scientifici\n\n" +
        "FASCE D'ETÀ TARGET:\n" +
        "- 3-6 anni: giochi semplici, educativi, sicuri\n" +
        "- 7-10 anni: primi TCG, costruzioni medie, puzzle\n" +
        "- 11-14 anni: TCG avanzati, strategici, collezioni\n" +
        "- 15+ anni: competitivi, collezionismo serio, giochi complessi\n\n" +
        "REGOLE FONDAMENTALI:\n" +
        "1. ANALIZZA le risposte precedenti per evitare duplicati\n" +
        "2. PROGREDISCI logicamente: età → categoria → marca/tipo → budget → preferenze specifiche\n" +
        "3. Se hai 4-6 risposte complete, imposta \"isComplete\": true\n" +
        "4. Fai domande SPECIFICHE e ACTIONABLE per la ricerca prodotti\n" +
        "5. Opzioni chiare e distinte (3-5 massimo)\n" +
        "6. Usa terminologia corretta del settore (starter deck, booster pack, set base, ecc.)\n\n" +
        "ESEMPI DI DOMANDE PROGRESSIVE OTTIME:\n" +
        "- Prima: \"Per quale fascia d'età stai cercando?\"\n" +
        "- Seconda: \"Che tipo di prodotto ti interessa di più?\"\n" +
        "- Terza: \"Quale marca o serie preferisci?\" (se TCG)\n" +
        "- Quarta: \"Qual è il tuo budget indicativo?\"\n" +
        "- Quinta: \"Che livello di difficoltà/esperienza?\"\n\n" +
        "ESEMPI DI OPZIONI SPECIFICHE:\n" +
        "- Budget TCG: \"Starter Deck (15-25€)\", \"Booster Box (80-120€)\", \"Singole carte (5-50€)\"\n" +
        "- Livello: \"Principiante (prime partite)\", \"Intermedio (conosco le regole)\", \"Esperto (gioco competitivo)\"\n" +
        "- Pokémon: \"Set Base recenti\", \"Set speciali/premium\", \"Carte vintage/rare\"\n\n" +
        "FORMATO RISPOSTA RICHIESTO (JSON valido):\n" +
        "{\n" +
        "  \"question\": \"Domanda specifica e professionale\",\n" +
        "  \"options\": [\"Opzione 1 dettagliata\", \"Opzione 2 dettagliata\", \"Opzione 3 dettagliata\"],\n" +
        "  \"isComplete\": false,\n" +
        "  \"rationale\": \"Solo se isComplete=true, spiega perché hai abbastanza info\"\n" +
        "}\n\n" +
        "IMPORTANTE: Restituisci SOLO il JSON, nessun altro testo.";

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
