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

## 4. Criar as contas do síndico e dos funcionários

Ainda não existe cadastro pelo próprio app (por segurança, só o síndico cria as contas). Faça assim:

1. No Supabase, vá em **Authentication > Users > Add user > Create new user**.
2. Preencha e-mail e senha.
3. No campo **User Metadata**, cole um JSON como este (isso já define o nome e o papel da pessoa automaticamente):

```json
{ "full_name": "Seu Nome", "role": "sindico" }
```

Para um funcionário, use `"role": "funcionario"` (ou simplesmente não inclua o campo `role`, que o padrão já é funcionário).

Repita para cada funcionário do prédio.

## 5. Rodar o app no celular

1. Instale o app **Expo Go** no seu celular (Android ou iOS).
2. No computador, dentro da pasta `condominio-app`, rode:

```bash
npm start
```

3. Um QR code vai aparecer no terminal. Abra o Expo Go no celular e escaneie (Android: opção de escanear dentro do próprio app; iOS: pela câmera nativa).
4. O app deve abrir e mostrar a tela de login. Entre com um dos usuários criados no passo 4.

## Observações importantes

- **Notificação push no Android**: dentro do Expo Go, notificações push só funcionam no iOS. No Android, elas só funcionam depois de gerar uma versão "development build" do app (um passo posterior, quando quiser ir além dos testes iniciais). No iOS, funciona normalmente pelo Expo Go.
- **Node.js**: este computador não tinha Node.js instalado e a instalação padrão foi bloqueada, então foi usada uma versão "portable" (sem instalador) salva em `%LOCALAPPDATA%\nodejs-portable`. Se abrir um novo terminal e os comandos `node`/`npm` não forem reconhecidos, feche e reabra o terminal (o PATH já foi salvo permanentemente para o seu usuário).
