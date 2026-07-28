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

## 4. Configurar a Edge Function de cadastro de usuários

Tanto o cadastro self-service (passo 5) quanto o síndico cadastrando
funcionários e o administrador criando síndicos (passo 6) dependem da mesma
função de servidor (Edge Function). Configure uma vez, rodando estes comandos
no terminal, dentro da pasta `condominio-app`:

```bash
npx supabase login
```

Isso abre o navegador pedindo pra você autorizar — é a sua conta Supabase,
então esse passo precisa ser feito por você mesmo, não por mim.

```bash
npx supabase link --project-ref qkatokyhufovtwwhowzo
npx supabase functions deploy admin-users
```

Sem isso, os botões de cadastrar usuário no app mostram erro dizendo que a
função não foi encontrada.

## 5. Cadastro self-service (o fluxo principal)

Esse é o jeito pretendido de uma pessoa nova começar a usar o Zelo, sem
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
  lista "Redirect URLs"). Como o Zelo hoje não tem um domínio público fixo
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

## 7. Síndico cadastrando funcionários

Já com um condomínio e um síndico criados (self-service ou pelo
administrador), o próprio síndico cadastra o restante da equipe pela tela
**Equipe → "+ Novo usuário"** — preenche nome, e-mail, senha provisória e
papel (funcionário ou síndico adicional), sem precisar abrir o Supabase.
Depois de criada, cada conta pode ser editada (nome, telefone, papel) ou
bloqueada direto pelo app, na mesma tela.

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
  o que preferir (o Zelo não tem integração direta com nenhuma plataforma de
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
