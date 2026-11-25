import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Last Dialogue | Les Archives du Présent',
  description: 'Un jeu de négociation posthumaine entre les archives réelles de 2026 et une Assemblée fictive en 2235.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr"><body>{children}</body></html>;
}
