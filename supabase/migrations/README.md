# Migrations versionadas (a partir da Fase 1)

A partir de 2026-07-29, `supabase/schema.sql` está **congelado** como
documentação histórica — nenhuma mudança de banco deve mais ser anexada ao
final desse arquivo. Toda alteração nova de schema vira um arquivo aqui,
numerado (`YYYYMMDDHHMMSS_descricao.sql`), aplicado manualmente no SQL
Editor do Supabase, na ordem dos arquivos.

## Por quê

O `schema.sql` monolítico (1800+ linhas) tornava difícil saber o estado
final esperado, revisar diffs, e já causou pelo menos um bug real de
produção (uma migração referenciava uma tabela definida mais adiante no
mesmo arquivo — o script abortava no meio e ninguém percebia, porque "colar
o schema.sql inteiro" parecia ter funcionado). Migrations pequenas e
numeradas tornam cada mudança revisável e rastreável isoladamente.

## Como aplicar

Nenhum arquivo desta pasta foi aplicado em produção pela Fase 1 — são
locais, aguardando você colar manualmente no SQL Editor do Supabase, **na
ordem dos nomes** (a numeração já garante a ordem certa):

1. `20260729120000_baseline_historico.sql` — cópia fiel do `schema.sql`
   atual. Já está tudo aplicado em produção; colar de novo é seguro (é
   idempotente) mas não é obrigatório — é só o marco zero da versionagem.
2. `20260729120100_soft_delete.sql` — adiciona `deleted_at`/`deleted_by`/
   `deletion_reason` em 8 tabelas e ajusta as políticas de select pra
   esconder registros excluídos de quem não é síndico.
3. `20260729120200_audit_events.sql` — cria a tabela `audit_events`
   (imutável) e os triggers que registram criação, mudança de status,
   responsável e custo em 5 tabelas.
4. `20260729120300_condominio_id_indexes.sql` — índices de performance,
   sem mudança de comportamento.

## Pendências conhecidas (não resolvidas nesta fase — precisam da sua confirmação)

- **`trigger_whatsapp_daily_digest()`** (dentro do baseline, linha ~1634
  do `schema.sql` original) grava o placeholder literal
  `'Bearer <SUA-ANON-KEY>'` no cabeçalho da chamada HTTP. Se esse
  placeholder nunca foi trocado pela chave anon real em produção, o cron
  diário do WhatsApp falha autenticação silenciosamente todo dia. Não
  mexemos nisso nesta fase — depende de você confirmar se já foi
  corrigido manualmente.
- Ausência de policy de **update/delete em `comments`** e de
  **update/delete em `whatsapp_messages`** — não resolvido, porque não
  ficou claro se é decisão de produto (imutabilidade proposital) ou
  esquecimento. `documents` ganhou uma policy de update nova (necessária
  pro soft delete funcionar), mas isso foi o único caso onde a ausência
  claramente impedia uma funcionalidade pedida nesta fase.
## Validação em homologação (2026-07-29)

As 4 migrations acima foram aplicadas num projeto Supabase de
homologação (separado da produção) e validadas por testes automatizados
que rodam contra ele — ver `supabase/tests/rls-isolation.test.ts` e
`.env.test.example`. Os testes provam, com dois condomínios reais
criados pelo fluxo self-service do app:

- um síndico não lê, não altera e não exclui (nem logicamente) ordens de
  outro condomínio;
- o mesmo vale para documentos, tarefas e fornecedores;
- `audit_events` não vaza entre condomínios, e o trigger de auditoria
  realmente grava o evento de criação (o síndico do próprio condomínio
  enxerga o evento).

Isso também confirma na prática que as colunas de soft delete e a tabela
`audit_events` funcionam num Postgres real — não só na revisão manual do
SQL. **A produção continua sem essas migrations aplicadas.**

Para rodar os testes você precisa, no projeto de homologação:
`.env.test` preenchido (copie de `.env.test.example`), provider de e-mail
habilitado para signup e **"Confirm email" desligado** em Authentication
→ Sign In / Providers → Email. Sem `.env.test`, os testes são pulados
automaticamente e `npm test` continua verde.

## Aplicando com o CLI (a partir da Fase 2)

A Fase 1 foi aplicada em produção com `npx supabase db push --linked`, que
funciona e dispensa colar SQL no editor. Dois cuidados aprendidos na prática:

**1. Confira sempre em qual projeto o CLI está linkado antes de dar push.**

```bash
npx supabase projects list   # procure "linked": true
npx supabase link --project-ref <ref>
```

Trocar de projeto para testar em homologação e **esquecer de voltar** faria o
próximo push cair no lugar errado.

**2. Se um projeto recebeu migrations manualmente (coladas no SQL Editor), o
CLI não sabe disso** e vai tentar reaplicar tudo desde o começo. Marque-as como
já aplicadas antes do primeiro push:

```bash
npx supabase migration repair --status applied 20260729120000
```

Foi exatamente o que aconteceu em homologação na Fase 2A: o push tentou
reaplicar o baseline e falhou em
`alter table public.profiles alter column condominio_id set not null`, porque
lá existem contas de teste sem condomínio (criadas pelos próprios testes de
escalonamento de privilégio). **O baseline não é seguro de reaplicar num banco
que tenha perfis sem `condominio_id`** — em produção passou porque todos os
perfis têm condomínio.

## Fase 2B — migração dos dados (2026-07-30)

`20260730160000_backfill_dominio_manutencao.sql` cria a maquinaria e
`20260730160100_executar_backfill.sql` a executa. A separação é
proposital: mover dados é re-executável, criar função não precisa ser, e
se a cópia falhar o erro não leva junto a definição das funções.

O que a cópia faz, sem apagar nem alterar nada nas tabelas antigas:

| Origem | Destino | Chave |
| --- | --- | --- |
| `maintenance_items` | `assets` | mesmo `id` |
| `maintenance_items` | `maintenance_plans` | `legacy_maintenance_item_id` |
| `occurrences` | `incidents` | mesmo `id` e mesmo número |
| `occurrences` | `work_orders` | mesmo `id` e **mesmo `os_number`** |
| `maintenance_records` | `work_orders` | mesmo `id`, número novo |
| `photo_urls` / `om_file_url` | `work_order_evidence` | `(work_order_id, file_url)` |

Preservar o `id` é o que faz comentários e notificações antigos
continuarem resolvendo. Preservar o `os_number` é inegociável: é por ele
que a equipe se refere à ordem no dia a dia.

**Reexecutar é seguro e esperado.** Até a Fase 2D cortar as telas, as
gravações continuam indo para as tabelas antigas e o espelho novo
envelhece. Antes de cada corte, rode de novo:

```sql
select * from public.fase2_backfill();           -- todos os condomínios
select * from public.fase2_relatorio_migracao(); -- confere, linha a linha
```

Ambas são de operação (postgres / SQL Editor), sem `grant` para
`authenticated`: contam linhas de **todos** os condomínios, e expor isso
a um usuário logado vazaria o volume de dados alheios. O síndico tem a
versão segura, restrita ao próprio condomínio:
`select * from public.fase2_resincronizar();`

### Duas armadilhas encontradas aqui (valem para as próximas migrations)

**1. `ON CONFLICT` não infere índice único parcial.** A primeira versão
usava `create unique index ... where legacy_maintenance_item_id is not
null`, e o `on conflict (legacy_maintenance_item_id)` falhava — o
Postgres só aceita um índice parcial como árbitro se o predicado for
repetido na própria cláusula. Como índice único comum já aceita vários
`NULL`, a solução foi tirar o `where`.

**2. `stamp_condominio_id()` carimba INCONDICIONALMENTE**
(`new.condominio_id := current_condominio_id()`). Numa migration não
existe `auth.uid()`, então o carimbo viraria `NULL` e o insert quebraria
no `not null`. O backfill desliga esse gatilho durante a cópia e religa
ao final — desligamento transacional, que o rollback desfaz sozinho.

Deliberadamente **não** afrouxei a função para "só carimba se vier
nulo": isso deixaria um cliente autenticado enviar um `condominio_id`
alheio em `occurrences`/`tasks`/`documents`, cujas policies de insert só
conferem `created_by`. Quando um síndico chama `fase2_resincronizar()`,
o gatilho fica ligado — e carimba justamente o condomínio certo.

## Fase 2C — lógica de domínio (2026-07-31)

`20260731100000_dominio_manutencao_logica.sql`. O modelo deixa de ser só
tabelas e passa a garantir comportamento, independentemente de qual tela
chame:

- **`proximo_vencimento(freq, intervalo, base)`** — função pura. Devolve
  `NULL` para gatilho não temporal (data específica, medidor, horas de
  funcionamento): não se calcula recorrência de calendário para eles, e
  inventar uma data seria pior que não ter.
- **`gerar_os_preventivas()`** — plano vencido (dentro de
  `lead_time_days`) vira ordem. `work_orders.plan_cycle_date` guarda
  para qual vencimento a ordem nasceu, e é o que torna a geração
  idempotente. Versão do síndico: `gerar_minhas_os_preventivas()`.
- **Máquina de estados** — `transicoes_work_order(status)` define de
  onde se pode ir para onde; de um estado final só se sai reabrindo. Só
  vale para UPDATE: a carga da 2B entrou por INSERT, e migrar histórico
  não é transição de estado.
- **Avanço do plano ao concluir** — a cadência é ancorada no vencimento
  PROGRAMADO, não na data em que se concluiu. Ancorar na conclusão faz a
  mensal andar para frente um pouco a cada mês até desalinhar.
- **`work_order_step_results` + não conformidade** — resposta fora da
  faixa (ou "não" num sim/não) marca a etapa como não conforme; se a
  etapa estiver configurada para isso, abre uma ocorrência ligada ao
  mesmo ativo. É o que transforma "passei lá e olhei" em "medi 1,2 bar
  onde o mínimo é 2".

**A geração NÃO é agendada por esta migration.** Ligar um `pg_cron` aqui
faria trabalho novo aparecer sozinho em produção antes de existir tela
para vê-lo. O agendamento entra na 2D, junto com a interface.

### O backfill precisa se afastar dos gatilhos de domínio

Duas colisões reais, encontradas antes de aplicar:

1. Se uma ocorrência já migrada for **reaberta na tela antiga**, a
   re-sincronização precisaria mover a ordem de `encerrada` para
   `em_execucao` — proibido pela máquina de estados, e com razão:
   ninguém executou essa transição, o backfill só espelha.
2. Concluir uma preventiva avança o plano; mas na re-sincronização o
   vencimento **já vem calculado** do modelo antigo (o auto-avanço de
   `maintenance_items` fez a conta e o backfill copiou). Avançar de novo
   pularia um ciclo inteiro.

Por isso `fase2_backfill` se identifica e os dois gatilhos se afastam
enquanto ela roda (`sincronizando_legado()`).

**Por que o sinal viaja em `application_name`:** a escolha natural seria
um parâmetro personalizado, mas o papel `postgres` do Supabase não tem
permissão para isso — `ALTER FUNCTION ... SET predify.sincronizando`
falha com `42501: permission denied to set parameter`. `application_name`
é USERSET e funciona; com `ALTER FUNCTION ... SET`, o valor vale só
durante a chamada e é restaurado na saída.

### Rodando os testes

Cada suíte cria condomínios de verdade pelo fluxo de signup, e o
Supabase limita cadastros **por hora, no projeto inteiro**. Rodar a
suíte completa várias vezes seguidas esgota a cota e faz suítes
falharem em `beforeAll` por um motivo que nada tem a ver com o código.
Nesse caso, rode um arquivo por vez ou espere a janela virar.

## Voltando atrás (rollback)

Nenhuma migration desta fase remove tabela, coluna ou dado — só adiciona
colunas (`deleted_at` etc.), uma tabela nova (`audit_events`), índices, e
substitui *policies* (nunca dados). Reverter é seguro:

```sql
-- reverter soft_delete (mantém os dados, só recua a estrutura)
alter table public.occurrences drop column if exists deleted_at, drop column if exists deleted_by, drop column if exists deletion_reason;
-- repetir pra tasks, maintenance_records, documents, service_requests, fornecedores, maintenance_items, checklist_templates
-- e recolar as versões anteriores das policies de select a partir do schema.sql original

-- reverter audit_events
drop trigger if exists log_audit_occurrences on public.occurrences;
drop trigger if exists log_audit_tasks on public.tasks;
drop trigger if exists log_audit_maintenance_records on public.maintenance_records;
drop trigger if exists log_audit_documents on public.documents;
drop trigger if exists log_audit_service_requests on public.service_requests;
drop function if exists public.log_audit_event();
drop table if exists public.audit_events;

-- reverter índices
drop index if exists public.occurrences_condominio_id_idx; -- etc, um por índice criado
```
