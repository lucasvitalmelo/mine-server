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

**5. Libere as portas no firewall do painel do provedor.**

Duas regras, porque as duas edições do jogo usam protocolos diferentes:

| Edição | Porta | Protocolo |
|---|---|---|
| Java | 25565 | TCP |
| Bedrock | 19132 | **UDP** |

Na Hostinger: VPS → Firewall → uma regra para cada linha da tabela.

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

A versão do cliente precisa bater com a do servidor. Este servidor fixa
`MC_VERSION=26.2` de propósito — é a versão de cliente Java que o Geyser sabe
emular, então não é só o Java que depende disso (ver "A versão do Paper está
fixa por causa disto" mais abaixo). Para confirmar o que realmente subiu:

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

Num loop de restart o log se repete e o erro real fica soterrado entre as
reinicializações. Procure a linha de erro **antes** de cada
`Minecraft server failed ... exitCode 1`, não as últimas linhas do log.

Se estiver escutando e a porta liberada no painel, o próximo suspeito é
incompatibilidade de versão do cliente — o erro no jogo diz qual versão o
servidor espera.

### Java conecta, Bedrock não

Comece pelo log, nunca pelo `ss`. O `ss` mente aqui: a porta 19132 aparece
escutando pelo `docker-proxy` assim que o compose publica o mapeamento, mesmo
com o Geyser fora do ar. Quem prova que o Geyser subiu é ele mesmo:

```bash
docker logs $(docker ps -qf name=minecraft) 2>&1 | grep -iE 'geyser|floodgate' | tail -20
```

Procure a linha `Started Geyser on UDP port 19132`. Sem ela o plugin não
carregou, e o resto do diagnóstico não faz sentido.

Com o Geyser de pé, teste se o pacote chega de fora. O Geyser tem comando
próprio pra isso:

```bash
IP=$(curl -s ifconfig.me) && docker exec $(docker ps -qf name=minecraft) rcon-cli geyser connectiontest $IP 19132
```

- **Não alcança** → firewall, ou a porta. Se não houver grupo de firewall no
  painel do provedor, nada está bloqueando e a suspeita vira a porta em si:
  há um defeito conhecido do lado da Microsoft em que clientes externos
  falham com `InitialConnection` nas portas padrão do Bedrock (19132, 19133,
  19155) e conectam normalmente em portas alternativas. Troque
  `MC_BEDROCK_PORT` para algo como `8420` e reconecte em `IP:8420`.
- **Alcança, mas o jogo não entra** → é o `auth-type`:

```bash
docker exec $(docker ps -qf name=minecraft) grep -n 'auth-type:' /data/plugins/Geyser-Spigot/config.yml
```

Tem que sair `  auth-type: floodgate`, **com os dois espaços de indentação**.
Se sair `online`, refaça o bloco de configuração obrigatória da seção
"Bedrock no mesmo servidor". Os dois ajustes vivem dentro do volume
`minecraft-data` e voltam ao padrão de fábrica se o volume for recriado.

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

## Bedrock no mesmo servidor

O servidor aceita as duas edições através do [Geyser](https://geysermc.org/)
(traduz o protocolo Bedrock para o protocolo Java em tempo real) e do
Floodgate (deixa entrar quem não tem conta Java). Funciona em console,
celular e Windows.

### Configuração obrigatória, uma vez, depois do primeiro boot

Sem isto a autenticação do Bedrock falha sempre: o servidor até aparece na
lista de servidores, mas nenhuma conexão passa do handshake. Não dá para
declarar isto no `docker-compose.yml` — os arquivos de configuração do Geyser
e do Floodgate só existem depois que o servidor sobe pela primeira vez, então
não há nada para editar antes disso.

Rode uma vez, depois que o primeiro deploy terminar de subir, e de novo
sempre que o volume `minecraft-data` for recriado:

```bash
docker exec $(docker ps -qf name=minecraft) sed -i 's/^\( *\)auth-type: .*/\1auth-type: floodgate/' /data/plugins/Geyser-Spigot/config.yml
docker exec $(docker ps -qf name=minecraft) sed -i 's/^\( *\)replace-spaces: .*/\1replace-spaces: true/' /data/plugins/floodgate/config.yml
docker restart $(docker ps -qf name=minecraft)
```

- **`auth-type: floodgate`** — é o que deixa entrar quem não tem conta Java.
  Sem isto o Geyser fica no padrão `online`, que exige a mesma conta
  Microsoft/Mojang do Java, e a conexão do Bedrock morre na autenticação.
- **`replace-spaces: true`** — troca espaço da gamertag por `_`. O comando do
  jogo separa argumentos por espaço e não aceita aspas em nome de jogador,
  então um nick com espaço faz o `kick` procurar o jogador errado e falhar em
  silêncio.

Para conectar: Servidores → Adicionar servidor, IP do VPS, **porta 19132**.

### O nick de quem entra pelo Bedrock tem um ponto na frente

O Floodgate prefixa o nome com `.` para não colidir com um jogador Java que
já use o mesmo nome — `.` não é um caractere válido em nick Java, então a
chance de colisão é zero. Como este servidor está com `replace-spaces`
ligado, espaço do gamertag vira `_`. Um Bedrock chamado `Gamer Tag` chega ao
servidor como `.Gamer_Tag`.

O espaço some por um motivo concreto: `/kick <alvo> [<motivo>]` separa os
argumentos por espaço, sem aspas para nome de jogador. Um nick com espaço
faria o servidor procurar o jogador errado e falhar em silêncio.

Isso muda o comando conforme a edição:

| Ação | Java | Bedrock |
|---|---|---|
| Liberar na whitelist | `whitelist add Nick` | `fwhitelist add Gamer_Tag` (**sem** o ponto) |
| Expulsar | `kick Nick` | `kick .Gamer_Tag` (**com** o ponto) |

O painel resolve isso sozinho — `panel/lib/nick.ts` escolhe o comando certo
pela edição do jogador. Só importa digitar à mão no Console livre do painel:
use a coluna certa. O comando errado não dá erro, devolve "player not
found", e parece que o nick está errado quando o problema é só o ponto.

O `fwhitelist` do Floodgate grava no mesmo `whitelist.json` que o `whitelist`
do Java lê e escreve — só que com o nome prefixado, então `whitelist list`
devolve `.Gamer_Tag`. A alternativa manual documentada pelo Floodgate,
`/whitelist add ".Gamer_Tag"` com o ponto, confirma que é o nome prefixado que
fica salvo no arquivo. É por isso que o botão × do painel funciona sem lógica
extra: ele lê `.Gamer_Tag` da lista, `validarNick` reconhece o ponto como
Bedrock, e o botão chama `fwhitelist remove`.

### A versão do Paper está fixa por causa disto

`MC_VERSION=26.2` não é a versão mais recente por acaso: é a versão de
cliente Java que o Geyser sabe emular. Voltar para `MC_VERSION=LATEST` quebra
o Bedrock no próximo redeploy que pegar uma versão mais nova — o Java
continua conectando, o Geyser é que para de traduzir certo.

Para atualizar, confira em
[geysermc.org/wiki/geyser/supported-versions](https://geysermc.org/wiki/geyser/supported-versions/)
qual versão Java o Geyser emula na sua versão, e mova as duas junto.

### Dois plugins acessórios

Além do Geyser e do Floodgate, que são obrigatórios, o servidor carrega mais
dois pelo Modrinth. Os dois são marcados como opcionais no compose: se o
Modrinth estiver fora, o servidor sobe sem eles em vez de não subir.

**ViaVersion** deixa cliente Java mais novo entrar num servidor mais velho —
é o que o Geyser já faz pelo Bedrock, só que para o Java. Na prática, quando
o launcher de alguém pular para 26.3 e o servidor ainda estiver em 26.2, essa
pessoa entra assim mesmo. Sem ele, todo mundo do Java teria que trocar o
perfil no mesmo dia em que você sobe de versão.

Ele não mexe no teto: o servidor continua sem poder passar da versão que o
Geyser emula, senão o Bedrock cai. O ViaVersion resolve o lado dos clientes,
não o do servidor.

**Bedrock Skin Restorer** aplica a skin real do jogador de Bedrock no lado
Java. O Floodgate sozinho converte a skin e sobe para o MineSkin, que roda em
contas doadas pela comunidade — quando a fila enche, a skin demora ou não
chega. Este plugin busca direto pela API global do Geyser.

Uma ressalva: ele conserta o que os **outros** veem. Existe um defeito
conhecido em que o jogador de Bedrock não enxerga a própria skin mesmo com
todo o resto funcionando. Se a sua aparecer errada só para você, peça a
alguém no Java para olhar antes de concluir que está quebrado.

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
| Container em loop de restart, porta nunca abre | Veja o log: se disser `requires running the server with Java NN or above`, a tag da imagem tem Java velho para a versão do Minecraft. Suba `MC_IMAGE_TAG` (ex: `java25`) **ou** fixe `MC_VERSION` numa versão mais antiga |
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

- A porta do RCON (25575) **não** é exposta ao host, de propósito. Administração
  só de dentro do VPS.
- `.env` está no `.gitignore`. Não comite a senha do RCON.

### Este servidor roda com `MC_ONLINE_MODE=FALSE`

Ou seja, aceita clientes sem conta Microsoft/Mojang. Isso é uma escolha
deliberada, e ela tem uma consequência técnica concreta que precisa ser
compensada.

**Sem autenticação, o servidor aceita qualquer nome que o cliente digitar.** Não
existe verificação. Se você digitar o nick de outra pessoa, você *é* aquela
pessoa para o servidor. Consequências em ordem de gravidade:

1. **Qualquer um pode entrar como op.** Se um nick com op for conhecido, basta
   digitá-lo. Op tem `/ban`, `/op`, acesso a comandos de mundo e a todo
   inventário. O mundo inteiro fica à mercê de quem descobrir o nome.
2. **A whitelist deixa de ser barreira real.** Ela compara nome, e nome passou a
   ser falsificável. Continua útil contra tráfego automatizado, não contra
   alguém que saiba o nick de um jogador.
3. **Skins não funcionam.** A Mojang não serve skin para sessão não
   autenticada. O plugin `SkinsRestorer` resolve.

**As quatro mitigações — trate como parte da configuração, não como conselho:**

| # | Ação | Por quê |
|---|---|---|
| 1 | `MC_OPS` **vazio** | Op pré-definido por nome = conta de admin sem senha na internet. Dê op por RCON, com a pessoa online |
| 2 | `MC_ENABLE_WHITELIST=TRUE` | Barra scanner e curioso que só tem o IP |
| 3 | `MC_PORT` fora da 25565 | Scanners procuram a porta padrão. Não é segurança, é redução de ruído |
| 4 | Plugin de login (`AuthMe`, `nLogin`) | **A correção de verdade** |

Dar op com segurança:

```bash
docker exec $(docker ps -qf name=minecraft) rcon-cli op SeuNick
```

### Plugin de login: o que devolve a autenticação

`ONLINE_MODE=FALSE` remove a checagem de identidade. Um plugin de login a
devolve, por senha dentro do jogo: no primeiro acesso o jogador usa `/register`,
nos seguintes `/login`. Quem digitar um nick já registrado sem saber a senha
fica travado e não interage com o mundo.

É isto que torna um servidor offline-mode administrável de verdade — e é também
a resposta para "tem senha para entrar?": com este plugin, tem.

```bash
CID=$(docker ps -qf name=minecraft)
docker cp AuthMeReloaded.jar $CID:/data/plugins/
docker restart $CID
```

Baixe o `.jar` compatível com a sua versão do Paper no site oficial do plugin.
**Registre a sua conta e se dê op imediatamente após instalar**, antes de passar
o IP para qualquer pessoa.

---

## Painel web de controle

Serviço `panel` no mesmo compose: Next.js falando RCON, protegido por senha.
Faz o que a tabela de comandos faz, com botão: lista de online, whitelist, kick,
anúncio no chat, save, e um console livre.

### Por que ele mora neste compose

O painel fala com o servidor de jogo em `minecraft:25575`, pela rede interna do
compose. A porta do RCON continua sem publicação no host — o painel entra por
dentro. Um recurso separado no Coolify ficaria em outra rede Docker e não
alcançaria nada.

### Passo 1 — DNS

Registro `A` para `painel`, apontando para o IP do VPS. Se você usa Cloudflare,
**pode deixar a nuvem laranja** — o painel é HTTP e passa pelo proxy sem
problema. Só o registro do jogo precisa ficar cinza.

### Passo 2 — Domínio no Coolify

**Configuration** → **General** → campo **Domains for panel**:

```
https://painel.seudominio.com:3000
```

O `:3000` não é a porta pública — é como o Coolify sabe para qual porta do
container rotear. Sem ele o Coolify tenta adivinhar e falha em silêncio, com o
Traefik respondendo `503 no available server`.

**Domains for minecraft fica vazio.** Ali é TCP puro; domínio não se aplica.

### Passo 3 — Senha

Gere uma senha longa e cole nas Environment Variables:

```bash
openssl rand -base64 24
```

```
PANEL_USER=admin
PANEL_PASSWORD=<a senha gerada>
```

Use apenas ASCII — Basic Auth não lida bem com acentos.

Redeploy. O Coolify vai buildar o painel; a primeira vez leva alguns minutos.

### O que a tela mostra

Ela se atualiza sozinha a cada 5 segundos — sem recarregar a página, só os dados
trocam. O indicador no topo diz quando foi a última atualização, e dá para pausar
(útil enquanto você digita um nick) ou forçar uma atualização na hora.

Os três comandos de leitura (`list`, `whitelist list`, `tps`) vão numa **única
conexão RCON** por ciclo. Uma conexão por comando triplicaria o handshake contra
um servidor de jogo que já roda com CPU contada.

### Por que o painel monta o volume do jogo

```yaml
    volumes:
      - minecraft-data:/mc:ro
```

O RCON **não tem** comando que responda "a whitelist está ligada?" — o
`whitelist list` devolve os nomes tanto ligada quanto desligada. Sem ler o
`server.properties`, o painel só poderia deduzir a partir do último clique, e
mentiria assim que alguém mexesse por fora.

Com o arquivo em mãos, ele mostra o estado real da whitelist, do `online-mode`,
da dificuldade e das distâncias — como está aplicado, não como você imagina.

O `:ro` é somente leitura: o painel não consegue escrever no mundo nem por erro
de código. Se o volume não estiver montado, a tela some com esses campos e segue
funcionando.

### Como a autenticação funciona

HTTP Basic Auth no middleware do Next.js. O navegador mostra o popup nativo de
usuário e senha, e guarda a credencial pela sessão.

Duas propriedades que importam:

**Falha fechada.** Sem `PANEL_PASSWORD` definida, o painel recusa *toda*
requisição com 403 — inclusive com credencial correta. Um painel que sobe sem
senha por engano seria pior que um painel fora do ar: ele controla o servidor
inteiro, `stop` incluído.

**Cobre as server actions.** O matcher do middleware pega todas as rotas, e
server actions são POST na própria rota. Não existe caminho que execute um
comando RCON sem passar pela senha.

A comparação usa digests SHA-256 em vez de `===`. Comparação de string sai no
primeiro caractere diferente, e esse tempo é mensurável — dá para descobrir a
senha caractere a caractere. Comparar digests de tamanho fixo remove esse canal.

### Rodar localmente

Dois portões, ambos exigindo `NODE_ENV != production` (que o Dockerfile fixa em
produção, tornando-os inalcançáveis lá):

| Variável | Efeito |
|---|---|
| `PANEL_DEV_BYPASS=true` | Pula a autenticação |
| `PANEL_DEV_FAKE_RCON=true` | Respostas simuladas, sem servidor de jogo |

```bash
cd panel && npm install && npm run dev
```

Crie um `panel/.env.local` com as duas — o arquivo é ignorado pelo Git.

### Se der `Error 526` no Cloudflare

Significa que o Cloudflare está em `Full (strict)` e o certificado do seu
servidor não é válido. A causa mais comum é o desafio do Let's Encrypt ser
bloqueado antes de chegar no Traefik — por exemplo, com Cloudflare Access na
frente do mesmo hostname, que intercepta `/.well-known/acme-challenge/` e
devolve tela de login.

Verifique qual certificado o origin apresenta:

```bash
openssl s_client -connect IP_DO_VPS:443 -servername painel.seudominio.com </dev/null 2>/dev/null | openssl x509 -noout -subject
```

`CN=TRAEFIK DEFAULT CERT` significa que nenhum certificado real foi emitido.
Remova o que estiver bloqueando o caminho do desafio e redeploye; ou, como
saída rápida, mude o SSL/TLS do Cloudflare para `Full`.

## Próximo passo natural

Backup automático do mundo com o sidecar `itzg/mc-backup` — um segundo serviço
no compose, com retenção e agendamento. Ficou fora daqui de propósito para não
misturar escopo. Vale fazer antes de o mundo ter valor sentimental.
