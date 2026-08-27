import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Guard do Cloudflare Access.
 *
 * Por que validar o JWT em vez de confiar no header: o Access só protege o
 * caminho que passa pelo Cloudflare. Quem bater direto no IP do VPS com o
 * Host correto chega no painel sem passar por lugar nenhum — e o painel tem
 * controle total do servidor de jogo. A validação do token fecha esse
 * bypass: sem um JWT assinado pelo Cloudflare, a requisição não entra.
 */

const teamDomain = process.env.CF_ACCESS_TEAM_DOMAIN;
const audience = process.env.CF_ACCESS_AUD;

const jwks = teamDomain
  ? createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`))
  : null;

function deny(motivo: string) {
  return new NextResponse(`Acesso negado. ${motivo}`, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function middleware(req: NextRequest) {
  if (!teamDomain || !audience || !jwks) {
    return deny(
      'O painel subiu sem CF_ACCESS_TEAM_DOMAIN ou CF_ACCESS_AUD. ' +
        'Sem elas não há como verificar quem está entrando, então nada passa.',
    );
  }

  const token =
    req.headers.get('cf-access-jwt-assertion') ??
    req.cookies.get('CF_Authorization')?.value;

  if (!token) {
    return deny('A requisição não passou pelo Cloudflare Access.');
  }

  try {
    await jwtVerify(token, jwks, {
      issuer: `https://${teamDomain}`,
      audience,
    });
  } catch {
    return deny('Token do Cloudflare Access inválido ou expirado.');
  }

  return NextResponse.next();
}

export const config = {
  // Tudo é protegido, inclusive as server actions (que são POST na própria rota).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
