"use client";

export type Rec = {
  id: number;
  name: string;
  price: number | null;
  image: string | null;
  permalink: string;
  addToCartUrl: string;
  score: number;
  reasons: string[];
};

export default function Results({ rationale, items, onRestart }: { rationale?: string; items: Rec[]; onRestart?: () => void }) {
  if (!items?.length) {
    return (
      <div className="empty-state">
        <h3>Nessun match perfetto trovato 😅</h3>
        <p>Prova a variare budget o preferenze materiali. Ti mostreremo alternative appena disponibili.</p>
      </div>
    );
  }

  return (
    <div>
      {rationale && <p style={{color: '#374151', marginBottom: '1.5rem'}}>{rationale}</p>}
      <div className="results-grid">
        {items.map(p => (
          <div key={p.id} className="product-card">
            {p.image ? (
              <img 
                src={p.image} 
                alt={p.name} 
                className="product-image"
                onError={(e) => {
                  // Prova a caricare da un proxy o nascondi
                  const target = e.currentTarget as HTMLImageElement;
                  if (!target.src.includes('placeholder')) {
                    // Usa un placeholder generico
                    target.src = `https://via.placeholder.com/300x200/f0f0f0/666666?text=${encodeURIComponent(p.name.substring(0, 20))}`;
                  } else {
                    // Se anche il placeholder fallisce, nascondi
                    target.style.display = 'none';
                  }
                }}
                loading="lazy"
                crossOrigin="anonymous"
              />
            ) : (
              <div className="product-image-placeholder">
                <span>{p.name.substring(0, 30)}...</span>
              </div>
            )}
            <div className="product-content">
              <h3 className="product-title">{p.name}</h3>
              <p className="product-price">{p.price != null ? `${p.price.toFixed(2)} €` : ""}</p>
              {p.reasons?.length > 0 && (
                <div className="product-reasons">
                  <ul>
                    {p.reasons.slice(0,2).map((r,i)=> <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="product-actions">
              <a className="btn-cart" href={p.addToCartUrl}>Aggiungi al carrello</a>
              <a className="btn-details" href={p.permalink} target="_blank" rel="noreferrer">Vedi dettagli</a>
            </div>
          </div>
        ))}
      </div>
      <p className="disclaimer">Suggerimenti generati con AI; verifica sempre disponibilità e caratteristiche prima dell'acquisto.</p>
      
      {onRestart && (
        <div style={{textAlign: 'center', marginTop: '2rem'}}>
          <button 
            onClick={onRestart}
            className="btn-restart"
          >
            🔄 Rifai Quiz
          </button>
        </div>
      )}
    </div>
  );
}
