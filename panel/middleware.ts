import { NextRequest, NextResponse } from 'next/server';

/**
 * Autenticação do painel: HTTP Basic Auth com uma senha compartilhada.
 *
 * O painel tem controle total do servidor de jogo — inclusive `stop`. Então a
 * regra aqui é falhar FECHADO: sem PANEL_PASSWORD configurada, nada passa. Um
 * painel que sobe sem senha por engano é pior que um painel fora do ar.
 *
 * Basic Auth trafega a senha em cada requisição. Isso só é aceitável sobre
 * HTTPS — que é o caso aqui, com Traefik e Cloudflare na frente. Em HTTP puro
 * seria equivalente a não ter senha.
 */

const user = process.env.PANEL_USER?.trim() || 'admin';
const password = process.env.PANEL_PASSWORD?.trim();

/**
 * Bypass para desenvolvimento local, travado em duas condições simultâneas.
 * A imagem de produção fixa NODE_ENV=production no Dockerfile, então isto é
 * inalcançável em produção mesmo que a variável vaze para o painel do Coolify.
 */
const devBypass =
  process.env.NODE_ENV !== 'production' && process.env.PANEL_DEV_BYPASS === 'true';

function pedirSenha(motivo: string) {
  return new NextResponse(motivo, {
    status: 401,
    headers: {
      // Faz o navegador abrir o popup nativo de usuário e senha.
      'WWW-Authenticate': 'Basic realm="Painel do servidor", charset="UTF-8"',
      'content-type': 'text/plain; charset=utf-8',
    },
  });
}

function recusar(motivo: string) {
  return new NextResponse(motivo, {
    status: 403,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/**
 * Compara via hash SHA-256 em vez de `===`.
 *
 * Comparação de string sai no primeiro caractere diferente, e esse tempo é
 * mensurável: dá para descobrir a senha caractere a caractere. Comparar
 * digests de tamanho fixo, sem atalho, remove esse canal.
 */
async function iguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  if (devBypass) return NextResponse.next();

  if (!password) {
    return recusar(
      'O painel subiu sem PANEL_PASSWORD. Sem senha configurada nada passa — ' +
        'defina a variável nas Environment Variables e faça redeploy.',
    );
  }

  const header = req.headers.get('authorization');
  if (!header?.startsWith('Basic ')) {
    return pedirSenha('Autenticação necessária.');
  }

  let decodificado: string;
  try {
    decodificado = atob(header.slice(6).trim());
  } catch {
    return pedirSenha('Credenciais malformadas.');
  }

  // Só o primeiro `:` separa — senha pode conter dois-pontos.
  const sep = decodificado.indexOf(':');
  if (sep === -1) return pedirSenha('Credenciais malformadas.');

  const [okUser, okPass] = await Promise.all([
    iguais(decodificado.slice(0, sep), user),
    iguais(decodificado.slice(sep + 1), password),
  ]);

  if (!okUser || !okPass) {
    return pedirSenha('Usuário ou senha incorretos.');
  }

  return NextResponse.next();
}

export const config = {
  // Protege tudo, inclusive as server actions (que são POST na própria rota).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
