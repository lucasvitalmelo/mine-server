import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Painel do servidor',
  description: 'Controle do servidor Minecraft via RCON',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
