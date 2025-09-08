import "./../styles/globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Consigli Prodotti | Mamma Quiz",
  description: "Un questionario rapido che ti suggerisce i prodotti giusti.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <main style={{minHeight: '100vh'}}>
          {children}
        </main>
      </body>
    </html>
  );
}
