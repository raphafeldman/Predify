# Como colocar o app pra rodar

## 1. Criar o projeto no Supabase (backend)

1. Acesse [supabase.com](https://supabase.com) e crie uma conta gratuita.
2. Clique em **New project**. Dê um nome (ex: `condominio`), crie uma senha de banco de dados (guarde em local seguro, mas não é usada no app) e escolha a região mais próxima (ex: São Paulo).
3. Aguarde ~2 minutos até o projeto ficar pronto.

## 2. Criar as tabelas do banco

1. No menu lateral, abra **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo [`supabase/schema.sql`](supabase/schema.sql) deste projeto, copie todo o conteúdo e cole no editor.
4. Clique em **Run**. Deve aparecer "Success. No rows returned".

Isso cria todas as tabelas, as regras de permissão (RLS) e o gatilho que envia notificação push ao síndico quando surge uma intercorrência.

## 3. Pegar as credenciais e configurar o app

1. No menu lateral, vá em **Project Settings > API**.
2. Copie a **Project URL** e a **anon public key**.
3. Na pasta do projeto (`condominio-app`), copie o arquivo `.env.example` para um novo arquivo chamado `.env` e cole os valores:

```
EXPO_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

O arquivo `.env` não é enviado ao git (fica só na sua máquina).

## 4. Configurar as Edge Functions

O cadastro self-service (passo 5), o síndico cadastrando funcionários e o
administrador criando síndicos (passo 6), e o síndico redefinindo a senha de
alguém (tela Equipe) dependem de funções de servidor (Edge Functions).
Configure uma vez, rodando estes comandos no terminal, dentro da pasta
`condominio-app`:

```bash
npx supabase login
```

Isso abre o navegador pedindo pra você autorizar — é a sua conta Supabase,
então esse passo precisa ser feito por você mesmo, não por mim.

```bash
npx supabase link --project-ref qkatokyhufovtwwhowzo
npx supabase functions deploy admin-users
npx supabase functions deploy admin-reset-password
npx supabase functions deploy whatsapp-daily-digest
npx supabase functions deploy whatsapp-send
npx supabase functions deploy admin-delete-user
npx supabase functions deploy admin-delete-condominio
```

Sem isso, os botões de cadastrar usuário e de redefinir senha no app mostram
erro dizendo que a função não foi encontrada. Sempre que o código de uma
dessas funções mudar (arquivos dentro de `supabase/functions/`), rode o
`deploy` de novo pra função correspondente.

### "Esqueci minha senha" (código por e-mail)

Pra evitar depender de um link de e-mail que abra o app certo (o Predify
ainda não tem domínio público fixo — ver observação sobre confirmação de
e-mail logo abaixo), o fluxo de "Esqueci minha senha" usa um **código de 6
dígitos** em vez de link: a pessoa recebe o código por e-mail e digita ele
no app junto com a nova senha.

O modelo de e-mail padrão do Supabase pra recuperação de senha só mostra um
link, sem o código. Pra habilitar o código, em **Authentication > Email
Templates > Reset Password**, edite o corpo do e-mail e adicione em algum
lugar do texto:

```
Seu código de verificação: {{ .Token }}
```

(pode deixar o link `{{ .ConfirmationURL }}` que já vem por padrão, ou
removê-lo — o app não usa ele, só o código.)

## 5. Cadastro self-service (o fluxo principal)

Esse é o jeito pretendido de uma pessoa nova começar a usar o Predify, sem
precisar de você: ela baixa o app, cria a própria conta e, em seguida, cria
o condomínio dela — virando síndica automaticamente. Cada condomínio criado
assim já nasce isolado dos outros (RLS cuida disso sozinho).

1. Na tela de login, tocar em "Ainda não tem condomínio cadastrado? Criar
   conta" e preencher nome, e-mail e senha.
2. Se o seu projeto Supabase exige confirmação de e-mail (configuração
   padrão), a pessoa recebe um link por e-mail antes de conseguir entrar —
   veja a observação abaixo se quiser desligar isso pros testes iniciais.
3. Depois de entrar, como a conta ainda não tem condomínio, aparece
   automaticamente a tela "Criar seu condomínio" (nome, CNPJ, endereço,
   telefone, administradora). Ao salvar, a pessoa vira síndica desse
   condomínio e cai no painel normal do app.
4. A partir daí, ela cadastra os próprios funcionários pela tela **Equipe**
   — ela é o único usuário grátis; cada funcionário adicional conta contra
   os **assentos pagos** do condomínio (começam em 0 — veja o passo 6 sobre
   como você, administrador, libera assentos).

### Sobre a confirmação de e-mail

Em **Authentication > Sign In / Providers** no painel do Supabase (em
projetos mais antigos fica em **Authentication > Settings**), na seção do
provedor **Email**, tem a opção **"Confirm email"** (ou "Enable email
confirmations"):

- **Ligada**: toda conta nova precisa clicar num link recebido por e-mail
  antes do primeiro login — mais seguro, recomendado antes de publicar de
  verdade.
- **Desligada**: a conta já entra ativa direto depois do cadastro — mais
  rápido pra testar, mas não é o que você quer com usuários de verdade.

É uma decisão sua; não mudei essa configuração por você. Se for ligar (ou já
estiver ligada) pra valer, dois ajustes complementares:

- **Envio de e-mail**: por padrão o Supabase usa um servidor de e-mail
  próprio com limite baixo (poucos e-mails por hora) — serve pra testar, mas
  não pra produção. Pra confirmar contas de verdade, configure um provedor
  SMTP em **Authentication > Settings > SMTP Settings** (ex: Resend,
  SendGrid, Postmark). É uma conta separada que você mesmo precisa criar
  nesse provedor — não é algo que eu deva fazer por você.
- **URL de redirecionamento**: o link do e-mail de confirmação abre a URL
  configurada em **Authentication > URL Configuration** (campo "Site URL" e
  lista "Redirect URLs"). Como o Predify hoje não tem um domínio público fixo
  (roda local / Expo Go), o link ainda confirma a conta no backend
  normalmente, só a página de destino pode não ser a esperada — quando você
  publicar a versão web em um domínio fixo, atualize esse campo pra apontar
  pra lá.

## 6. Administrador da plataforma: criar condomínio e síndico pra alguém

Além do cadastro self-service, você (dono do produto) pode continuar criando
condomínios manualmente — útil pra dar suporte a alguém, ou pra cadastrar um
cliente você mesmo. Esse papel de **administrador da plataforma** precisa ser
criado manualmente uma vez, direto no banco (não tem como se auto-promover
pelo app, por segurança).

1. No Supabase, crie sua própria conta de login normalmente (**Authentication
   > Users > Add user**), com seu e-mail e senha. Não precisa preencher
   nenhum metadata — administrador da plataforma não tem perfil de
   condomínio.
2. Copie o **UUID** dessa conta (aparece na lista de usuários, coluna `UID`).
3. Volte ao **SQL Editor** e rode (trocando pelo UUID copiado):

```sql
insert into public.platform_admins (user_id) values ('cole-o-uuid-aqui');
```

4. Pronto — ao entrar no app com esse login, aparece a tela **Administração**,
   com a lista de condomínios e o botão **"Novo condomínio"**.

A partir daí, pra criar um condomínio novo (e o síndico dele) sem precisar
sair do app:

1. Clique em "Novo condomínio" e preencha nome, CNPJ, endereço, telefone e
   administradora.
2. Assim que salvar, o app já abre a tela "Criar síndico" — preencha nome,
   e-mail e senha provisória da pessoa que vai administrar aquele condomínio.
   Esse é o único usuário grátis do condomínio.
3. Pra criar (ou repor) o síndico de um condomínio que já existe, clique nele
   na lista e use o botão "Criar síndico para este condomínio" dentro da
   tela de edição.
4. Os **assentos pagos** (quantos usuários além do primeiro síndico podem ser
   cadastrados) começam em 0 — ajuste na mesma tela de edição do condomínio,
   junto com o status de cobrança (ainda é um ajuste manual, feito por você;
   a cobrança automática de verdade é uma etapa futura).
5. **Excluir um condomínio inteiro** — botão "Excluir condomínio" (zona de
   risco) na mesma tela de edição; pede pra digitar o nome do condomínio
   pra confirmar. Apaga todas as contas de usuário dele, os arquivos no
   Storage, e todos os registros — não dá pra desfazer.
6. **Excluir só um usuário** (inclusive um síndico) — pela tela "Ver dados
   do condomínio (suporte)", ícone de lixeira ao lado do nome na lista
   Equipe; pede pra digitar o nome completo da pessoa pra confirmar. A
   conta é apagada, mas o que a pessoa criou (Ordens, Tarefas, Documentos,
   comentários) continua existindo — só passa a mostrar "Usuário removido"
   no lugar do nome dela.

## 7. Síndico cadastrando funcionários

Já com um condomínio e um síndico criados (self-service ou pelo
administrador), o próprio síndico cadastra o restante da equipe pela tela
**Equipe → "+ Novo usuário"** — preenche nome, e-mail, senha provisória e
papel (funcionário ou síndico adicional), sem precisar abrir o Supabase.
Depois de criada, cada conta pode ser editada (nome, telefone, papel) ou
bloqueada direto pelo app, na mesma tela. O síndico também pode redefinir a
senha de qualquer funcionário direto por lá ("Redefinir senha", dentro da
edição do usuário) — útil quando alguém esquece a senha e não quer passar
pelo fluxo de e-mail.

## 8. Rodar o app no celular

1. Instale o app **Expo Go** no seu celular (Android ou iOS).
2. No computador, dentro da pasta `condominio-app`, rode:

```bash
npm start
```

3. Um QR code vai aparecer no terminal. Abra o Expo Go no celular e escaneie (Android: opção de escanear dentro do próprio app; iOS: pela câmera nativa).
4. O app deve abrir e mostrar a tela de login. Entre com um dos usuários criados no passo anterior, ou toque em "Criar conta" pra testar o cadastro self-service.

## 9. Rodar a versão web (pelo computador)

```bash
npm run web
```

Abre no navegador (geralmente `http://localhost:8081`). É o mesmo app, mesmo
login, mesmos dados — só que com um menu lateral em vez de abas embaixo,
melhor pra usar em tela grande. As telas **Equipamentos**, **Rotinas**,
**Relatórios**, **Histórico** e **Equipe** aparecem nesse menu lateral (as
três primeiras e a Equipe só para o síndico), e no celular ficam acessíveis
pela tela Perfil.

## 10. Agente de WhatsApp (lembretes e avisos)

Fase 1: só envio — um lembrete automático diário de pendências pro
funcionário, e um botão pro síndico mandar um aviso avulso (tela Equipe →
editar usuário → "Enviar aviso no WhatsApp"). Ainda não dá pra criar Ordem
de Serviço respondendo uma mensagem — isso fica pra uma fase futura.

Diferente do resto do app, essa parte depende de contas e aprovações
externas que só você pode fazer (não é algo que eu consiga configurar por
aqui):

1. **Criar o app na Meta**: em [developers.facebook.com](https://developers.facebook.com),
   crie um app do tipo "Business", adicione o produto **WhatsApp**. Isso já
   vem com um número de teste gratuito pra desenvolvimento (dá pra usar
   pra testar antes de verificar um negócio de verdade).
2. **Pegar as credenciais**: no painel do produto WhatsApp do seu app, em
   **API Setup**, anote o **Phone Number ID** e gere um **token de acesso
   permanente** (o token temporário que aparece por padrão expira em 24h —
   pra gerar um permanente, crie um "System User" em
   **Business Settings > System Users**, dê a ele permissão no app, e gere
   o token por lá, com o escopo `whatsapp_business_messaging`).
3. **Cadastrar os dois modelos de mensagem**: em **WhatsApp Manager >
   Message Templates**, criar dois templates, categoria "Utility", idioma
   Portuguese (BR):
   - `lembrete_diario_pt` — corpo com duas variáveis: *"Bom dia, {{1}}! Você
     tem {{2}} pendência(s) para hoje no Predify. Abra o app para
     conferir."*
   - `aviso_sindico_pt` — corpo com uma variável: *"📋 Aviso do síndico:
     {{1}}"*

   Cada template passa por aprovação da Meta antes de poder ser usado —
   costuma levar de algumas horas a um dia. Enquanto não aprovados, o envio
   simplesmente falha (fica registrado como "falha" na tabela
   `whatsapp_messages`, com o motivo).
4. **Configurar os segredos das Edge Functions** (o token da Meta nunca
   fica no app nem no `schema.sql` — só aqui):

```bash
npx supabase secrets set WHATSAPP_ACCESS_TOKEN=seu-token-permanente
npx supabase secrets set WHATSAPP_PHONE_NUMBER_ID=seu-phone-number-id
```

5. **Ativar o lembrete diário**: no `schema.sql` que você colou no SQL
   Editor (passo 2), procure a função `trigger_whatsapp_daily_digest` e
   troque `<SUA-ANON-KEY>` pela sua anon public key de verdade (a mesma do
   passo 3, `Project Settings > API`) antes de rodar — sem isso o lembrete
   diário não consegue chamar a função. Depois de rodar, confirme que o
   cron ficou agendado:

```sql
select * from cron.job where jobname = 'whatsapp-daily-digest';
```

6. **Números de telefone**: o app aceita qualquer formato no cadastro do
   funcionário (ex: `(11) 90000-0000`), mas normaliza sozinho na hora de
   mandar — só garanta que o DDD está incluído. Funcionário sem telefone
   cadastrado simplesmente não recebe nada.

## 11. Colocar em produção (sem loja de app, sem domínio próprio)

A versão web do Predify (a mesma base de código, `npx expo export
--platform web`) já é o app inteiro — login, painel, tudo. Publicando ela
numa hospedagem de graça, dá pra usar de verdade no condomínio sem passar
pela App Store nem pela Play Store, e ainda instalar como se fosse um app
(ícone na tela inicial) via PWA.

### 11.1 Colocar o código no GitHub

1. Em [github.com/new](https://github.com/new), crie um repositório vazio
   (pode ser privado, é gratuito) — sem adicionar README/licença/gitignore,
   pra não conflitar com o que já existe no projeto.
2. Copie a URL do repositório (ex:
   `https://github.com/seu-usuario/predify.git`).
3. Dentro da pasta `condominio-app`:

```bash
git remote add origin https://github.com/seu-usuario/predify.git
git push -u origin master
```

### 11.2 Publicar na Vercel

1. `npx vercel login` — abre o navegador pra você autorizar com sua conta
   (crie uma gratuita em [vercel.com](https://vercel.com) se ainda não
   tiver, dá pra entrar direto com o GitHub).
2. Dentro da pasta `condominio-app`, rode `npx vercel` — ele pergunta
   algumas coisas (nome do projeto, diretório): pode aceitar os valores
   padrão. O arquivo `vercel.json` do projeto já diz pra Vercel como
   buildar (`npx expo export --platform web`) e onde fica o resultado
   (`dist`).
3. Antes do primeiro build de verdade, vá no painel do projeto na Vercel →
   **Settings → Environment Variables** e adicione, com os mesmos valores
   do seu `.env` local:

```
EXPO_PUBLIC_SUPABASE_URL=https://qkatokyhufovtwwhowzo.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-chave-anon-publica
```

   Sem isso o site builda mas não consegue falar com o Supabase.
4. `npx vercel --prod` pra publicar de verdade. A URL final aparece no
   terminal, algo como `https://predify.vercel.app` (ou com um sufixo
   aleatório, se esse nome já estiver em uso por outra conta).

### 11.3 Deploy automático a cada atualização

No painel da Vercel, em **Settings → Git**, conecte o repositório do
GitHub que você criou no passo 11.1 (ou importe o projeto direto do
GitHub desde o início, em vez de usar `npx vercel` — os dois caminhos
terminam no mesmo lugar). A partir daí, todo `git push` faz a Vercel
rebuildar e publicar sozinha — não precisa rodar `vercel --prod` de novo
manualmente.

### 11.4 Instalar como app no celular (PWA)

Depois de publicado, abra a URL pelo navegador do celular:
- **Android (Chrome)**: menu (⋮) → "Adicionar à tela inicial" / "Instalar
  app".
- **iPhone (Safari)**: botão de compartilhar → "Adicionar à Tela de
  Início".

Isso cria um ícone igual a um app de verdade, sem passar por loja
nenhuma — é o que o `public/manifest.json` e as tags de PWA em
`public/index.html` habilitam.

### 11.5 Sem domínio próprio por enquanto

A URL fica no formato `algo.vercel.app`, gerada de graça pela Vercel — não
precisa comprar domínio nenhum pra começar a usar. Quando (e se) quiser um
domínio próprio no futuro, basta adicionar em **Settings → Domains** no
painel do projeto na Vercel.

## O que cada tela nova faz

- **Equipamentos**: cadastro de tudo que precisa de manutenção no prédio
  (elevador, bomba, gerador...), com local, marca/modelo, número de
  série/patrimônio e frequência. A próxima data de manutenção avança
  sozinha depois de cada registro preventivo, e o síndico recebe um aviso
  push 7 dias antes de vencer (e enquanto estiver vencido).
- **Rotinas**: o síndico cadastra os itens de checklist que o funcionário
  vê na tela Rotina, escolhendo periodicidade (diária/semanal/mensal/
  trimestral/semestral/anual) e, se quiser, um responsável específico.
- **Relatórios**: filtro por período (diário/semanal/mensal/anual) com
  gráfico de pizza e de barra sobre o que foi executado x pendente, com
  botão para exportar em PDF (no celular abre o menu de compartilhar; no
  navegador, abre a tela de impressão do próprio navegador — escolha "Salvar
  como PDF").
- **Prestadores**: documenta um problema do condomínio (infiltração,
  elétrica, porta quebrada etc.) e usa o botão "Compartilhar" para mandar a
  solicitação de orçamento pra qualquer prestador — WhatsApp, GetNinjas, ou
  o que preferir (o Predify não tem integração direta com nenhuma plataforma de
  prestadores; ele só monta o texto e abre o menu nativo de compartilhamento
  do celular/navegador). Uma ocorrência aberta também pode virar solicitação
  direto pelo botão "Solicitar orçamento" na tela Ocorrências. O histórico de
  status (aberta → orçamento solicitado → orçado → aprovado → concluído)
  fica registrado, criando com o tempo uma lista de prestadores de confiança
  do próprio condomínio.
- **Administração**: só aparece pra quem é administrador da plataforma (veja
  passo 6). Lista todos os condomínios cadastrados, permite criar um novo
  (com o síndico dele), criar/repor o síndico de um condomínio existente, e
  ajustar manualmente os assentos pagos e o status de cobrança de cada um.

## Observações importantes

- **Se o SQL Editor reclamar de `pg_cron`** (usado no aviso de manutenção
  vencendo): vá em **Database → Extensions** no painel do Supabase, procure
  "pg_cron" e ative por lá manualmente, depois rode o `schema.sql` de novo.
- **Depois de atualizações no app**: sempre que o `supabase/schema.sql` mudar,
  colar o arquivo inteiro de novo no SQL Editor e rodar — é seguro rodar
  quantas vezes quiser, ele só adiciona o que ainda não existe.
- **Notificação push no Android**: dentro do Expo Go, notificações push só funcionam no iOS. No Android, elas só funcionam depois de gerar uma versão "development build" do app (um passo posterior, quando quiser ir além dos testes iniciais). No iOS, funciona normalmente pelo Expo Go.
- **Node.js**: este computador não tinha Node.js instalado e a instalação padrão foi bloqueada, então foi usada uma versão "portable" (sem instalador) salva em `%LOCALAPPDATA%\nodejs-portable`. Se abrir um novo terminal e os comandos `node`/`npm` não forem reconhecidos, feche e reabra o terminal (o PATH já foi salvo permanentemente para o seu usuário).
