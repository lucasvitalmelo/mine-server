# Servidor Minecraft Java (Paper) em VPS Coolify — KVM 2

**Data:** 2026-08-27
**Status:** Aprovado

## Objetivo

Subir um servidor Minecraft Java Edition para um grupo pequeno de amigos em um
VPS Hostinger KVM 2 que já roda Coolify, sem sufocar o Coolify nem as outras
aplicações hospedadas ali. O uso de recursos é requisito de primeira classe, não
detalhe de ajuste fino.

## Restrições

- **Hardware:** 2 vCPU / 8 GB RAM / NVMe (a confirmar — ver "Premissas").
- **Carga existente:** Coolify (Traefik + Postgres + Redis) ≈ 2 GB, mais 1–2
  aplicações pequenas ≈ 1 GB. Orçamento disponível: ~5 GB.
- **2 vCPU é a restrição dominante.** O tick loop do Paper é essencialmente
  single-thread; CPU esgota antes da RAM.
- **Entrega:** repositório Git com `docker-compose.yml`, consumido pelo Coolify
  como recurso *Docker Compose*.

## Premissas

As especificações do VPS não foram confirmadas por medição no momento da
escrita. Para que isso não bloqueie nada, **todos os limites são parametrizados
por variável de ambiente** com defaults conservadores. Ajustar o orçamento é
editar `.env` no Coolify e redeployar — nenhuma mudança de código.

Comando de verificação, documentado no README:

```bash
nproc && free -h && df -h / && docker stats --no-stream
```

## Arquitetura

Um único serviço Docker: `itzg/minecraft-server` (tag do Java parametrizada,
default `java25`) com `TYPE=PAPER`. É a
imagem padrão de fato do ecossistema — configuração inteira por variáveis de
ambiente, tratamento correto de SIGTERM, healthcheck embutido. Não há motivo
para construir imagem própria.

```
Internet ──TCP 25565──> [firewall provedor] ──> [container minecraft] ──> volume /data
                                                  │
                        Traefik/Coolify ──X──  (não participa: MC não é HTTP)
```

## Decisões de dimensionamento

| Parâmetro | Default | Justificativa |
|---|---|---|
| Limite de memória do container | `4G` | Deixa ~1 GB de folga sobre o orçamento de 5 GB |
| Limite de CPU do container | `1.5` | Preserva meio core para Coolify e Traefik |
| Heap da JVM (`MAX_MEMORY`) | `3G` | ≈75% do limite do container |
| `USE_AIKAR_FLAGS` | `TRUE` | Flags de G1GC validadas pela comunidade |
| `VIEW_DISTANCE` | `7` | Alavanca de CPU mais pesada que o heap neste hardware |
| `SIMULATION_DISTANCE` | `5` | Idem |
| `MAX_PLAYERS` | `10` | Escopo declarado: grupo de amigos |
| `MAX_TICK_TIME` | `-1` | Desarma o watchdog; em CPU limitada ele mata o servidor em picos de tick legítimos |

**O heap nunca pode igualar o limite do container.** Metaspace, buffers diretos
do Netty, threads e overhead de GC vivem fora do heap e contam para o cgroup.
Heap = limite produz OOM-kill em vez de GC pressure — o container morre em
silêncio, sem stack trace.

## Acoplamento versão do Minecraft ↔ versão do Java

Cada versão do Minecraft exige uma versão mínima de Java. Deixar `MC_VERSION`
flutuando em `LATEST` com a tag do Java fixa é um bug esperando para acontecer:
quando o Minecraft sobe o requisito de Java, o servidor passa a sair com
`exitCode 1` em loop de restart, sem nunca abrir a porta — e o erro real fica
soterrado entre as reinicializações no log.

Isto aconteceu de fato na primeira tentativa de deploy: `LATEST` resolveu para
MC 26.1, que exige Java 25, contra uma imagem `java21`.

Decisão: a tag da imagem é parametrizada (`MC_IMAGE_TAG`, default `java25`) e o
acoplamento está documentado nos dois arquivos. Assim que o servidor estabiliza,
`MC_VERSION` deve ser fixada na versão exata — remove o problema pela raiz e
evita que um redeploy obrigue todos os jogadores a atualizar o cliente sem aviso.

## Rede: por que não existe domínio

O Coolify roteia todo recurso como HTTP através do Traefik. O protocolo Java do
Minecraft é TCP bruto e não passa por roteador HTTP. Consequências de design:

- Mapeamento de porta explícito no compose: `${MC_PORT:-25565}:25565`.
- Campo de domínio **vazio** no Coolify. Preenchê-lo não ajuda e confunde.
- Porta liberada no **firewall do painel do provedor**. `ufw` no VPS é inócuo
  aqui: portas publicadas pelo Docker escrevem iptables na chain `DOCKER`, que
  contorna o ufw. Diagnóstico correto de falha de conexão é `ss -tlnp | grep
  25565`, não `ufw status`.
- Conexão do cliente: `IP_DO_VPS:25565`.
- Domínio bonito (opcional): registro DNS **A** de `mc.dominio.com` para o IP do
  VPS. Passa longe do Traefik. Se a porta sair de 25565, um registro `SRV`
  `_minecraft._tcp` remove a necessidade de digitar a porta.

## Verificação obrigatória pós-deploy

Limitar o uso é o requisito central, então ele precisa ser verificado, não
presumido. O Coolify transforma o compose antes de rodar; se o bloco `deploy`
for descartado, o container roda sem limite e parece saudável até sufocar o
Coolify.

```bash
docker inspect $(docker ps -qf name=minecraft) --format 'mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}}'
```

Ambos diferentes de zero. Se `mem=0`, o fallback é trocar `deploy.resources` por
`mem_limit` + `cpus` no nível do serviço — uma forma ou a outra, nunca as duas.

## Persistência

Volume nomeado montado em `/data`.

**Isto é requisito de funcionamento, não conveniência.** Sem volume, o próximo
redeploy do Coolify recria o container e apaga o mundo.

`stop_grace_period: 60s`. A janela default de 10s do Docker entre SIGTERM e
SIGKILL corta o save do mundo no meio do flush, corrompendo chunks. A imagem
trata SIGTERM corretamente — só precisa de tempo.

## Segurança

**Mudança de requisito (2026-08-27):** o usuário pediu explicitamente que o
servidor aceite clientes sem conta legítima. `ONLINE_MODE` passa a `FALSE`.
A recomendação original era `TRUE`; a decisão foi reafirmada após a exposição
do trade-off e está registrada aqui como escolha consciente.

O custo não é de licenciamento, é de controle de acesso: sem autenticação, o
servidor aceita qualquer nome que o cliente informe. Um op identificado por
nome torna-se uma conta administrativa sem senha exposta na internet, e a
whitelist deixa de ser barreira real porque compara justamente o campo que
passou a ser falsificável.

Compensações incorporadas à configuração, não deixadas como conselho:

| Mitigação | Efeito |
|---|---|
| `MC_OPS` vazio, op só por RCON com o jogador online | Elimina o alvo de impersonação privilegiada |
| `MC_ENABLE_WHITELIST=TRUE` (default invertido) | Barra tráfego automatizado; não barra quem sabe um nick |
| `MC_PORT` fora da 25565 (recomendado) | Redução de ruído de scanner, não segurança |
| Plugin de login (AuthMe/nLogin) | **Única mitigação que restaura autenticação de fato**, por senha in-game |

O plugin de login é também a resposta à pergunta "tem senha para entrar?" —
sem ele, não há nenhuma forma de identidade verificável neste servidor.

- `ONLINE_MODE=FALSE` — aceita clientes não autenticados (ver acima).
- RCON **habilitado, porta não exposta**. Administração via `docker exec` no
  host. RCON aberto na internet é vetor de invasão direto.
- `RCON_PASSWORD` obrigatória via env, sem default. O compose falha alto se
  estiver ausente em vez de subir com senha fraca.
- Whitelist desligada por default, variáveis prontas para ligar
  (`ENABLE_WHITELIST`, `WHITELIST`).

## Economia opcional de recursos: autopause

A imagem suporta `ENABLE_AUTOPAUSE`, que suspende o processo da JVM quando não
há jogadores conectados — devolve praticamente toda a CPU ao host durante a
maior parte do dia.

**Default: desligado.** O trade-off é real: a primeira tentativa de conexão após
a pausa costuma expirar antes do servidor retomar, e o jogador precisa tentar de
novo. Para um grupo de amigos que avisa antes de jogar, vale ligar. Fica
documentado como opt-in em vez de imposto.

Há um acoplamento a respeitar: o autopause é **incompatível com o healthcheck**
enviado. O `mc-health` abre conexão na porta a cada 30s, o que o autopause lê
como atividade — o servidor nunca pausa, ou acorda em loop. Ligar autopause
exige comentar o bloco `healthcheck`. Isso está anotado nos dois arquivos.

## Fora de escopo

- **Backup automático do mundo** (sidecar `itzg/mc-backup`). Vale a pena e é o
  próximo passo natural, mas não faz parte de "montar o servidor".
- Plugins. A base aceita plugins em `/data/plugins`; nenhum vem pré-instalado.
- Proxy Velocity / múltiplos servidores. Não cabe em 2 vCPU.

## Entregáveis

| Arquivo | Conteúdo |
|---|---|
| `docker-compose.yml` | Serviço único, limites parametrizados, volume, grace period, healthcheck |
| `.env.example` | Toda variável com default e comentário explicando o efeito |
| `README.md` | Passo-a-passo do Coolify, firewall, conexão, operação via RCON, tuning |
| `.gitignore` | `.env` fora do versionamento |

## Critérios de sucesso

1. Recurso Docker Compose deployado no Coolify sem erro.
2. Cliente Java conecta em `IP:25565`.
3. `docker stats` mostra o container dentro dos limites configurados.
4. Coolify e as aplicações existentes seguem responsivos.
5. Redeploy no Coolify preserva o mundo.
