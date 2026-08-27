# Servidor Minecraft Java (Paper) para Coolify

Servidor Minecraft Java Edition rodando Paper, dimensionado para um VPS
**KVM 2 (2 vCPU / 8 GB)** que já hospeda Coolify e outras aplicações.

O design completo e o raciocínio por trás de cada número estão em
[docs/superpowers/specs/2026-08-27-minecraft-paper-coolify-design.md](docs/superpowers/specs/2026-08-27-minecraft-paper-coolify-design.md).

---

## Antes de começar: confirme o orçamento

Rode no VPS via SSH:

```bash
nproc && free -h && df -h / && docker stats --no-stream
```

O que olhar:

- **`nproc`** — se vier menos que 2, baixe `MC_CPU_LIMIT` e `MC_VIEW_DISTANCE`.
- **`free -h`, coluna `available`** — subtraia 1 GB de folga para o sistema.
  O resto é o teto de `MC_MEM_LIMIT`.
- **`docker stats`** — quanto Coolify e suas apps já consomem de verdade,
  que costuma ser diferente do que a documentação promete.

Se `available` for menor que 5 GB, ajuste em `.env`:
`MC_MEM_LIMIT=3G` e `MC_MAX_MEMORY=2G`.

---

## Deploy no Coolify

**1. Suba este repositório para o GitHub** (ou GitLab).

**2. No Coolify:** projeto → **+ New Resource** → **Docker Compose** →
selecione o repositório e a branch.

**3. Deixe o campo de domínio VAZIO.**

Não é esquecimento. O Coolify roteia recursos como HTTP através do Traefik, e o
protocolo Java do Minecraft é TCP bruto — não passa por roteador HTTP. A conexão
acontece pela porta mapeada, não por domínio. Preencher o campo não ajuda em
nada.

**4. Aba Environment Variables:** cole o conteúdo de
[.env.example](.env.example) e preencha `RCON_PASSWORD`.

```bash
openssl rand -base64 24
```

**5. Libere a porta 25565/TCP no firewall do painel do provedor.**

Na Hostinger: VPS → Firewall → nova regra, TCP, porta 25565.

Note que `ufw allow 25565/tcp` no VPS é, na prática, **inócuo**: portas
publicadas pelo Docker escrevem regras de iptables na chain `DOCKER`, que
contorna o ufw inteiro. A porta fica acessível independentemente do ufw. Rodar o
comando não faz mal, mas se você não conseguir conectar, o problema **não** está
ali — está no firewall do painel do provedor. Ver "Não consigo conectar" abaixo.

**6. Deploy.** A primeira inicialização é lenta — baixa o Paper e gera o mundo.
Espere de 2 a 5 minutos antes de tentar conectar.

**7. Confirme que os limites de recurso realmente aplicaram.** Este passo não é
opcional: limitar o uso é o ponto do exercício, e o Coolify transforma o compose
antes de rodar — se o bloco `deploy` for descartado, você fica com um container
sem limite nenhum, que parece saudável até sufocar o Coolify.

```bash
docker inspect $(docker ps -qf name=minecraft) --format 'mem={{.HostConfig.Memory}} cpu={{.HostConfig.NanoCpus}}'
```

Esperado: os dois valores **diferentes de zero** (ex: `mem=4294967296 cpu=1500000000`).

Se vier `mem=0`, o bloco `deploy` não pegou. Edite o `docker-compose.yml`,
remova o bloco `deploy` inteiro e coloque no lugar, no nível do serviço:

```yaml
    mem_limit: ${MC_MEM_LIMIT:-4G}
    cpus: "${MC_CPU_LIMIT:-1.5}"
```

Uma forma **ou** a outra — as duas juntas dão conflito.

---

## Conectar

No cliente Minecraft Java, **Multijogador → Adicionar servidor**:

```
IP_DO_SEU_VPS:25565
```

A versão do cliente precisa bater com a do servidor. Com `MC_VERSION=LATEST`,
descubra qual subiu:

```bash
docker logs $(docker ps -qf name=minecraft) 2>&1 | grep -i "version"
```

### Não consigo conectar

Um comando resolve a ambiguidade — rode no VPS:

```bash
ss -tlnp | grep 25565
```

- **Aparece algo escutando** → o container está no ar e bindado corretamente. O
  bloqueio é externo: firewall do painel do provedor. Não perca tempo com ufw.
- **Não aparece nada** → o container não subiu ou não publicou a porta.
  Investigue com `docker ps -a` e `docker logs $(docker ps -aqf name=minecraft)`.

Se estiver escutando e a porta liberada no painel, o próximo suspeito é
incompatibilidade de versão do cliente — o erro no jogo diz qual versão o
servidor espera.

### Domínio no lugar do IP (opcional)

Crie um registro DNS **A**:

| Tipo | Nome | Valor |
|---|---|---|
| A | `mc` | IP do VPS |

Conecta em `mc.seudominio.com:25565`. Isso passa longe do Traefik — é resolução
de nome pura.

Para dispensar o `:25565`, adicione também um registro **SRV**:

| Campo | Valor |
|---|---|
| Nome | `_minecraft._tcp.mc` |
| Prioridade / Peso / Porta | `0` / `5` / `25565` |
| Alvo | `mc.seudominio.com` |

---

## Operação

O Coolify adiciona um sufixo ao nome do container, então use o filtro em vez do
nome fixo:

```bash
CID=$(docker ps -qf name=minecraft)
```

**Console do servidor (RCON, de dentro do host):**

```bash
docker exec -i $CID rcon-cli
```

Abre um prompt. Comandos sem a barra: `list`, `whitelist add Fulano`,
`op Fulano`, `save-all`, `stop`.

Comando único:

```bash
docker exec $CID rcon-cli list
```

**Logs em tempo real:**

```bash
docker logs -f $CID
```

**Uso de recursos:**

```bash
docker stats $CID
```

**Backup manual do mundo:**

```bash
docker exec $CID rcon-cli save-all
VOL=$(docker volume ls -q | grep minecraft-data) && echo "volume: $VOL"
docker run --rm -v $VOL:/data -v $(pwd):/backup alpine \
  tar czf /backup/mundo-$(date +%F).tar.gz -C /data world
tar tzf mundo-$(date +%F).tar.gz | head
```

**Resolva o `$VOL` de verdade, não chute o nome.** O Coolify prefixa volumes com
o identificador do projeto, e um `-v nome-errado:/data` **não dá erro** — o
Docker cria um volume novo e vazio, e você recebe um `.tar.gz` de poucos bytes
achando que tem backup. É para isso que serve o `tar tzf` no final: se ele não
listar arquivos de `world/`, você não tem backup.

**Plugins:** copie o `.jar` para `/data/plugins` e reinicie.

```bash
docker cp plugin.jar $CID:/data/plugins/
docker restart $CID
```

---

## Tuning

Sintoma primeiro, ajuste depois. Meça com `docker stats` e com `/tps` dentro do
jogo (20.0 é o ideal; abaixo de 18 já dá pra sentir).

| Sintoma | Ajuste |
|---|---|
| TPS baixo, CPU no teto | Baixe `MC_SIMULATION_DISTANCE` para 4, depois `MC_VIEW_DISTANCE` para 6 |
| Container reiniciando sozinho | OOM-kill. Suba `MC_MEM_LIMIT` **ou** baixe `MC_MAX_MEMORY` — o heap precisa ficar em ~75% do limite |
| Coolify lento durante o jogo | Baixe `MC_CPU_LIMIT` para 1.0 |
| Servidor ocioso comendo CPU | Ligue `MC_ENABLE_AUTOPAUSE=TRUE` **e comente o bloco `healthcheck`** no compose — o `mc-health` sondando a porta a cada 30s impede a pausa |
| Travadas ao explorar terreno novo | Normal em 2 vCPU (geração de chunk). Pré-gere o mundo com o plugin Chunky |

Confirmar OOM-kill:

```bash
docker inspect $CID --format '{{.State.OOMKilled}} {{.State.ExitCode}}'
```

`true` ou exit code `137` = memória. Não é bug do Minecraft.

### A regra que mais gente erra

`MC_MAX_MEMORY` (heap da JVM) **nunca** deve igualar `MC_MEM_LIMIT` (limite do
container). Metaspace, buffers diretos do Netty, threads e overhead de GC vivem
fora do heap e contam para o limite do cgroup. Heap igual ao limite não gera
pressão de GC — gera OOM-kill: o container morre em silêncio, sem stack trace,
sem nada no log do jogo.

---

## Segurança

- `ONLINE_MODE=TRUE` — só contas Microsoft/Mojang legítimas. Não desligue.
- A porta do RCON (25575) **não** é exposta ao host, de propósito. Administração
  só de dentro do VPS.
- Se você divulgar o IP em Discord ou fórum, ligue a whitelist:
  `MC_ENABLE_WHITELIST=TRUE` e liste as contas em `MC_WHITELIST`.
- `.env` está no `.gitignore`. Não comite a senha do RCON.

---

## Próximo passo natural

Backup automático do mundo com o sidecar `itzg/mc-backup` — um segundo serviço
no compose, com retenção e agendamento. Ficou fora daqui de propósito para não
misturar escopo. Vale fazer antes de o mundo ter valor sentimental.
