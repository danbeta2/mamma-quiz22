"use client";
import { useState } from "react";

export type Answers = {
  ageRange: "0-6m" | "6-12m" | "1-3y" | "3-6y" | "6+y" | "";
  goal: "risparmio" | "sostenibilità" | "comodità" | "scorta" | "regalo" | "";
  materials: string[];
  usage: "basso" | "medio" | "alto" | "";
  budgetBand: "<20" | "20-40" | "40-80" | "80+" | "";
  urgency: "oggi" | "2-3gg" | "settimana" | "";
};

const STEPS = ["Età", "Obiettivo", "Materiali", "Uso", "Budget", "Urgenza"];

const Chip = ({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`chip ${active ? "active" : ""}`}
  >
    {children}
  </button>
);

export default function Quiz({ onComplete }: { onComplete: (answers: Answers) => void }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    ageRange: "",
    goal: "",
    materials: [],
    usage: "",
    budgetBand: "",
    urgency: "",
  });

  function next() { setStep(s => Math.min(s + 1, STEPS.length - 1)); }
  function back() { setStep(s => Math.max(s - 1, 0)); }
  function set<K extends keyof Answers>(k: K, v: Answers[K]) { setAnswers(a => ({ ...a, [k]: v })); }
  function toggleMaterial(v: string) {
    setAnswers(a => a.materials.includes(v)
      ? { ...a, materials: a.materials.filter(x => x !== v) }
      : { ...a, materials: [...a.materials, v] });
  }

  function canContinue() {
    switch (step) {
      case 0: return !!answers.ageRange;
      case 1: return !!answers.goal;
      case 2: return true; // opzionale
      case 3: return !!answers.usage;
      case 4: return !!answers.budgetBand;
      case 5: return !!answers.urgency;
      default: return false;
    }
  }

  return (
    <div className="quiz-card">
      <div className="step-info">
        Passo {step + 1} di {STEPS.length}: <span style={{fontWeight: 500, color: '#374151'}}>{STEPS[step]}</span>
      </div>

      {step === 0 && (
        <div className="chip-grid">
          {(["0-6m","6-12m","1-3y","3-6y","6+y"] as const).map(v => (
            <Chip key={v} active={answers.ageRange===v} onClick={() => set("ageRange", v)}>
              {v.replace("m"," mesi").replace("y"," anni")}
            </Chip>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="chip-grid">
          {(["risparmio","sostenibilità","comodità","scorta","regalo"] as const).map(v => (
            <Chip key={v} active={answers.goal===v} onClick={() => set("goal", v)}>{v}</Chip>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="chip-grid">
          {["ipoallergenico","senza-profumi","plastic-free","tessuto-lavabile","nessuna-preferenza"].map(v => (
            <Chip
              key={v}
              active={answers.materials.includes(v)}
              onClick={() => v==="nessuna-preferenza" ? set("materials", []) : toggleMaterial(v)}
            >
              {v.replace("-"," ")}
            </Chip>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="chip-grid">
          {(["basso","medio","alto"] as const).map(v => (
            <Chip key={v} active={answers.usage===v} onClick={() => set("usage", v)}>{v}</Chip>
          ))}
        </div>
      )}

      {step === 4 && (
        <div className="chip-grid">
          {(["<20","20-40","40-80","80+"] as const).map(v => (
            <Chip key={v} active={answers.budgetBand===v} onClick={() => set("budgetBand", v)}>{v} €</Chip>
          ))}
        </div>
      )}

      {step === 5 && (
        <div className="chip-grid">
          {(["oggi","2-3gg","settimana"] as const).map(v => (
            <Chip key={v} active={answers.urgency===v} onClick={() => set("urgency", v)}>{v}</Chip>
          ))}
        </div>
      )}

      <div className="nav-buttons">
        <button className="btn btn-back" onClick={back} disabled={step===0}>
          Indietro
        </button>
        {step < STEPS.length - 1 ? (
          <button
            className="btn btn-primary"
            disabled={!canContinue()}
            onClick={next}
          >
            Avanti
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={!canContinue()}
            onClick={() => onComplete(answers)}
          >
            Mostra i consigli
          </button>
        )}
      </div>
    </div>
  );
}
