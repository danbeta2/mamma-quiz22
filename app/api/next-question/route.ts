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
        "1. ANALIZZA ATTENTAMENTE le risposte precedenti per evitare domande duplicate o simili\n" +
        "2. NON ripetere mai domande già fatte, anche con parole diverse\n" +
        "3. PROGREDISCI logicamente: età → contesto familiare → categoria → occasione → budget → preferenze specifiche\n" +
        "4. Se hai 5-6 risposte complete, imposta \"isComplete\": true\n" +
        "5. Fai domande SPECIFICHE e ACTIONABLE per la ricerca prodotti\n" +
        "6. Includi domande sul contesto familiare (fratelli, sorelle, numero bambini)\n" +
        "7. Opzioni chiare e distinte (4-6 massimo)\n" +
        "8. Usa terminologia corretta del settore\n\n" +
        "SEQUENZA DOMANDE PRIORITARIE:\n" +
        "1. \"Per quale fascia d'età stai cercando?\" (se non già chiesta)\n" +
        "2. \"Quanti bambini/ragazzi giocheranno insieme?\" (contesto familiare)\n" +
        "3. \"Che tipo di prodotto ti interessa?\" (categoria)\n" +
        "4. \"Per quale occasione?\" (compleanno, regalo, uso quotidiano)\n" +
        "5. \"Qual è il tuo budget indicativo?\" (range di prezzo)\n" +
        "6. Domande specifiche per categoria (marca TCG, stile gioco, livello esperienza)\n\n" +
        "ESEMPI DI DOMANDE SPECIFICHE RICHIESTE:\n" +
        "- Contesto familiare: \"Quanti bambini giocheranno insieme?\", \"Ha fratelli o sorelle?\"\n" +
        "- Occasione: \"È per un compleanno o uso quotidiano?\"\n" +
        "- TCG specifico: \"Quale marca di carte preferisci?\", \"Che livello di esperienza?\"\n" +
        "- Giochi tavolo: \"Preferisci giochi strategici o cooperativi?\"\n\n" +
        "ESEMPI DI OPZIONI DETTAGLIATE:\n" +
        "- Contesto: \"Solo uno\", \"2 bambini (fratelli/sorelle)\", \"3-4 bambini\", \"Gruppo più grande\"\n" +
        "- Budget TCG: \"Starter Deck (15-25€)\", \"Booster Box (80-120€)\", \"Singole carte premium (50-200€)\"\n" +
        "- Livello: \"Principiante (prime carte)\", \"Intermedio (conosco le regole)\", \"Esperto (gioco competitivo)\"\n\n" +
        "FORMATO RISPOSTA RICHIESTO (JSON valido):\n" +
        "{\n" +
        "  \"question\": \"Domanda specifica e professionale\",\n" +
        "  \"options\": [\"Opzione 1 dettagliata\", \"Opzione 2 dettagliata\", \"Opzione 3 dettagliata\", \"Opzione 4 dettagliata\"],\n" +
        "  \"isComplete\": false,\n" +
        "  \"rationale\": \"Solo se isComplete=true, spiega perché hai abbastanza info\"\n" +
        "}\n\n" +
        "IMPORTANTE: Restituisci SOLO il JSON, nessun altro testo. NON ripetere mai domande già fatte.";

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
