// Edge Function: roda uma vez por dia (chamada pelo pg_cron do banco, ver
// trigger_whatsapp_daily_digest() em supabase/schema.sql) e manda, pelo
// WhatsApp, um lembrete pra cada funcionário que tem pendência hoje —
// tarefa agendada pra hoje, ou item de rotina diária ainda não concluído.
// Sem autenticação de usuário porque quem chama é o próprio banco (via
// anon key, que não é segredo); a Edge Function faz suas próprias
// consultas com privilégio de service role, igual admin-users.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getServiceRoleKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeysRaw) {
    const parsed = JSON.parse(secretKeysRaw) as Record<string, string>;
    const key = parsed.default ?? Object.values(parsed)[0];
    if (key) return key;
  }

  throw new Error('Nenhuma service role/secret key disponível no ambiente da função.');
}

// Tira tudo que não é dígito e garante o código do país (assume Brasil,
// 55, quando o número parece só ter DDD + número local).
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length <= 11 ? `55${digits}` : digits;
}

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  params: string[]
): Promise<{ ok: boolean; error?: string }> {
  const token = Deno.env.get('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  if (!token || !phoneNumberId) {
    return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não configurado.' };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }],
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, error: `Meta respondeu ${res.status}: ${errBody.slice(0, 300)}` };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const adminClient = createClient(supabaseUrl, getServiceRoleKey());
    const today = new Date().toISOString().slice(0, 10);

    const { data: funcionarios, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, full_name, phone, condominio_id')
      .eq('role', 'funcionario')
      .eq('active', true)
      .not('phone', 'is', null)
      .neq('phone', '');

    if (profilesError) throw profilesError;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const f of funcionarios ?? []) {
      const [tasksRes, templatesRes] = await Promise.all([
        adminClient
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', f.id)
          .eq('status', 'pendente')
          .eq('scheduled_for', today),
        adminClient
          .from('checklist_templates')
          .select('id')
          .eq('condominio_id', f.condominio_id)
          .eq('frequency', 'diaria')
          .eq('active', true)
          .or(`assigned_to.eq.${f.id},assigned_to.is.null`),
      ]);

      const templateIds = (templatesRes.data ?? []).map((t) => t.id as string);
      let doneToday = 0;
      if (templateIds.length > 0) {
        const { count } = await adminClient
          .from('checklist_entries')
          .select('id', { count: 'exact', head: true })
          .in('template_id', templateIds)
          .eq('entry_date', today)
          .eq('done', true);
        doneToday = count ?? 0;
      }

      const pendingRotina = Math.max(0, templateIds.length - doneToday);
      const pendingTasks = tasksRes.count ?? 0;
      const total = pendingTasks + pendingRotina;

      if (total === 0) {
        skipped++;
        continue;
      }

      const firstName = f.full_name.trim().split(' ')[0];
      const phone = normalizePhone(f.phone as string);
      const result = await sendWhatsAppTemplate(phone, 'lembrete_diario_pt', [firstName, String(total)]);

      await adminClient.from('whatsapp_messages').insert({
        condominio_id: f.condominio_id,
        user_id: f.id,
        phone,
        kind: 'lembrete_diario',
        body: `Bom dia, ${firstName}! Você tem ${total} pendência(s) para hoje no Predify.`,
        status: result.ok ? 'enviado' : 'falha',
        error: result.error ?? null,
      });

      if (result.ok) sent++;
      else failed++;
    }

    return jsonResponse({ sent, skipped, failed });
  } catch (err) {
    return jsonResponse({ error: (err instanceof Error && err.message) || 'Erro inesperado.' }, 500);
  }
});
