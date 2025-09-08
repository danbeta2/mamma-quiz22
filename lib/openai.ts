export type QuizAnswers = {
  ageRange: "0-6m" | "6-12m" | "1-3y" | "3-6y" | "6+y";
  goal: "risparmio" | "sostenibilità" | "comodità" | "scorta" | "regalo";
  materials: string[];    // es: ["ipoallergenico","senza-profumi","plastic-free","tessuto-lavabile"]
  usage: "basso" | "medio" | "alto";
  budgetBand: "<20" | "20-40" | "40-80" | "80+";
  urgency: "oggi" | "2-3gg" | "settimana";
};

export type LLMIntent = {
  search_terms: string[];  // 3–6 keyword in IT
  tags: string[];          // 2–5 etichette sintetiche
  min_price?: number;      // euro
  max_price?: number;      // euro
  rationale: string;       // 1–2 frasi rassicuranti
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

export async function buildIntentFromAnswers(answers: QuizAnswers): Promise<LLMIntent> {
  const prompt = `
Sei un consulente acquisti per mamme. In base alle risposte, restituisci SOLO un JSON:
{
  "search_terms": string[] (3-6 in italiano),
  "tags": string[] (2-5),
  "min_price": number opzionale,
  "max_price": number opzionale,
  "rationale": string (1-2 frasi rassicuranti)
}

RISPOSTE:
${JSON.stringify(answers)}

Regole prezzi:
- "<20" => max_price 20
- "20-40" => min_price 20, max_price 40
- "40-80" => min_price 40, max_price 80
- "80+" => min_price 80
Niente testo fuori dal JSON.
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const data: any = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  const json = start >= 0 && end > start ? text.slice(start, end + 1) : "{}";
  const parsed = JSON.parse(json);
  return parsed as LLMIntent;
}
