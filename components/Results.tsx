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

export default function Results({ rationale, items }: { rationale?: string; items: Rec[] }) {
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
            {p.image && <img src={p.image} alt={p.name} className="product-image" />}
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
    </div>
  );
}
