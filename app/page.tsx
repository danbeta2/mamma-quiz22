"use client";
import { useState } from "react";
import DynamicQuiz, { type Answer } from "@/components/DynamicQuiz";
import Results, { type Rec } from "@/components/Results";

declare global { interface Window { gtag?: (...args:any[]) => void } }

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [rationale, setRationale] = useState<string>();
  const [items, setItems] = useState<Rec[]>([]);
  const [done, setDone] = useState(false);

  function restartQuiz() {
    setDone(false);
    setLoading(false);
    setRationale(undefined);
    setItems([]);
  }

  async function onComplete(answers: Answer[]) {
    try {
      window.gtag?.("event", "quiz_complete", { screen_name: "quiz" });
      setLoading(true);
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Errore server");
      setRationale(json.rationale);
      setItems(json.recommendations || []);
      setDone(true);
      window.gtag?.("event", "view_recommendations", { items_count: (json.recommendations||[]).length });
    } catch (e: any) {
      alert(e?.message || "Errore di rete. Riprova tra poco.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <section className="text-center">
        <h1 className="text-3xl">Mamma Quiz</h1>
        <p className="text-gray-600 mt-2">Rispondi a poche domande: ti consiglieremo 1–3 prodotti adatti alle tue esigenze.</p>

        {!done && !loading && <div className="mt-8"><DynamicQuiz onComplete={onComplete} /></div>}

        {loading && (
          <div className="loading-card">
            Sto scegliendo i prodotti migliori per te…
          </div>
        )}

        {!loading && done && (
          <div className="mt-8">
            <Results rationale={rationale} items={items} onRestart={restartQuiz} />
          </div>
        )}
      </section>
    </div>
  );
}
