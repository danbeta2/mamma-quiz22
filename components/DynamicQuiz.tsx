"use client";
import { useState, useEffect } from "react";

export type Answer = {
  question: string;
  answer: string;
};

export type QuestionData = {
  question: string;
  options: string[];
  isComplete: boolean;
  rationale?: string;
};

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

export default function DynamicQuiz({ onComplete }: { onComplete: (answers: Answer[]) => void }) {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Carica la prima domanda
  useEffect(() => {
    loadNextQuestion();
  }, []);

  async function loadNextQuestion() {
    try {
      setLoading(true);
      setError("");
      setSelectedAnswer("");

      const res = await fetch("/api/next-question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          context: "Questionario per consigli prodotti per mamme e bambini"
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Errore server");

      setCurrentQuestion(data);

      // Se il quiz è completo, invia le risposte
      if (data.isComplete) {
        onComplete(answers);
      }
    } catch (e: any) {
      setError(e?.message || "Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  function handleAnswer() {
    if (!selectedAnswer || !currentQuestion) return;

    const newAnswers = [...answers, {
      question: currentQuestion.question,
      answer: selectedAnswer
    }];
    
    setAnswers(newAnswers);
    
    // Carica la prossima domanda
    setTimeout(() => loadNextQuestion(), 500);
  }

  function goBack() {
    if (answers.length === 0) return;
    
    const newAnswers = answers.slice(0, -1);
    setAnswers(newAnswers);
    setSelectedAnswer("");
    
    // Ricarica la domanda per il nuovo stato
    setTimeout(() => loadNextQuestion(), 100);
  }

  if (loading && !currentQuestion) {
    return (
      <div className="quiz-card">
        <div className="step-info">Sto preparando le domande per te...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="quiz-card">
        <div className="step-info" style={{color: '#dc2626'}}>
          Errore: {error}
        </div>
        <div className="nav-buttons">
          <button className="btn btn-primary" onClick={loadNextQuestion}>
            Riprova
          </button>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="quiz-card">
        <div className="step-info">Caricamento...</div>
      </div>
    );
  }

  return (
    <div className="quiz-card">
      <div className="step-info">
        Domanda {answers.length + 1} {loading && "- Caricamento..."}
      </div>

      <div style={{marginBottom: '1.5rem'}}>
        <h3 style={{fontSize: '1.125rem', fontWeight: 600, marginBottom: '1rem'}}>
          {currentQuestion.question}
        </h3>
        
        <div className="chip-grid">
          {currentQuestion.options.map((option, index) => (
            <Chip
              key={index}
              active={selectedAnswer === option}
              onClick={() => setSelectedAnswer(option)}
            >
              {option}
            </Chip>
          ))}
        </div>
      </div>

      <div className="nav-buttons">
        <button 
          className="btn btn-back" 
          onClick={goBack} 
          disabled={answers.length === 0 || loading}
        >
          Indietro
        </button>
        
        <button
          className="btn btn-primary"
          disabled={!selectedAnswer || loading}
          onClick={handleAnswer}
        >
          {loading ? "Caricamento..." : "Avanti"}
        </button>
      </div>

      {answers.length > 0 && (
        <div style={{marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280'}}>
          Risposte date: {answers.length}
        </div>
      )}
    </div>
  );
}
