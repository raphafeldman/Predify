import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from '../../components/AppModal';
import { BarChart } from '../../components/BarChart';
import { ModalFormLayout } from '../../components/ModalFormLayout';
import { PieChart } from '../../components/PieChart';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { TextField } from '../../components/ui/TextField';
import { useAuth } from '../../lib/auth-context';
import { supabase } from '../../lib/supabase';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../../lib/theme';
import type { Condominio, WorkOrderStatus } from '../../lib/types';
import {
  WO_STATUS_ABERTOS,
  WO_STATUS_CONCLUIDOS,
  WO_STATUS_LABEL,
} from '../../lib/workOrderStatus';

type PeriodFilter = 'diario' | 'semanal' | 'mensal' | 'anual';

const PERIOD_LABEL: Record<PeriodFilter, string> = {
  diario: 'Diário',
  semanal: 'Semanal',
  mensal: 'Mensal',
  anual: 'Anual',
};

function toDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getPeriodStart(filter: PeriodFilter): string {
  const now = new Date();
  switch (filter) {
    case 'diario':
      return toDateOnly(now);
    case 'semanal': {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      return toDateOnly(d);
    }
    case 'mensal': {
      const d = new Date(now);
      d.setDate(1);
      return toDateOnly(d);
    }
    case 'anual': {
      const d = new Date(now);
      d.setMonth(0, 1);
      return toDateOnly(d);
    }
  }
}

interface ReportItem {
  title: string;
  status: string;
  date: string;
  performedBy?: string;
}

interface ReportData {
  occurrencesResolved: number;
  occurrencesOpen: number;
  tasksDone: number;
  tasksPending: number;
  maintenanceRecords: number;
  checklistDone: number;
  itemsByCategory: {
    'Ordens de Serviço': ReportItem[];
    Tarefas: ReportItem[];
    Manutenções: ReportItem[];
    Rotina: ReportItem[];
  };
}

const CATEGORY_ORDER: (keyof ReportData['itemsByCategory'])[] = [
  'Ordens de Serviço',
  'Tarefas',
  'Manutenções',
  'Rotina',
];

export default function RelatoriosScreen() {
  const { profile } = useAuth();
  const [filter, setFilter] = useState<PeriodFilter>('semanal');
  const [data, setData] = useState<ReportData | null>(null);
  const [condo, setCondo] = useState<Condominio | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [condoFormOpen, setCondoFormOpen] = useState(false);

  const loadCondo = useCallback(async () => {
    if (!profile) return;
    const { data: condoData } = await supabase
      .from('condominios')
      .select('*')
      .eq('id', profile.condominio_id)
      .single();
    if (condoData) setCondo(condoData as Condominio);
  }, [profile]);

  const load = useCallback(async () => {
    setLoading(true);
    const periodStart = getPeriodStart(filter);
    const periodStartIso = `${periodStart}T00:00:00.000Z`;

    // Ordens e manutenções saem da MESMA tabela agora, separadas pela
    // origem: preventiva/inspeção nasceram de um plano; as demais são
    // trabalho pedido. Sem essa separação, uma preventiva apareceria nas
    // duas seções do relatório.
    const [ordensRes, taskRes, checklistRes] = await Promise.all([
      supabase.from('work_orders').select('*, assets(name)').gte('created_at', periodStartIso),
      supabase.from('tasks').select('*').gte('created_at', periodStartIso),
      supabase
        .from('checklist_entries')
        .select('*, checklist_templates(title), profiles(full_name)')
        .eq('done', true)
        .gte('entry_date', periodStart),
    ]);

    const ordens = ordensRes.data ?? [];
    const tasks = taskRes.data ?? [];
    const checklist = checklistRes.data ?? [];

    const ehManutencao = (o: { origin_type: string }) =>
      o.origin_type === 'preventiva' || o.origin_type === 'inspecao';
    const manutencoes = ordens.filter(ehManutencao);
    const demais = ordens.filter((o) => !ehManutencao(o));

    setData({
      occurrencesResolved: ordens.filter((o) =>
        WO_STATUS_CONCLUIDOS.includes(o.status as WorkOrderStatus)
      ).length,
      occurrencesOpen: ordens.filter((o) => WO_STATUS_ABERTOS.includes(o.status as WorkOrderStatus))
        .length,
      tasksDone: tasks.filter((t) => t.status === 'concluida').length,
      tasksPending: tasks.filter((t) => t.status === 'pendente').length,
      maintenanceRecords: manutencoes.length,
      checklistDone: checklist.length,
      itemsByCategory: {
        'Ordens de Serviço': demais
          .map((o) => ({
            title: `OS #${o.number ?? '—'} — ${o.title}`,
            status: WO_STATUS_LABEL[o.status as WorkOrderStatus] ?? o.status,
            date: o.created_at,
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        Tarefas: tasks
          .map((t) => ({
            title: t.title,
            status: t.status === 'concluida' ? 'Concluída' : 'Pendente',
            date: t.created_at,
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        Manutenções: manutencoes
          .map((m) => ({
            title: (m as { assets?: { name: string } | null }).assets?.name ?? m.title,
            status: WO_STATUS_LABEL[m.status as WorkOrderStatus] ?? m.status,
            date: m.completed_at ?? m.created_at,
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        Rotina: checklist
          .map((c) => ({
            title:
              (c as { checklist_templates?: { title: string } | null }).checklist_templates?.title ??
              'Rotina',
            status: 'Concluída',
            date: c.done_at ?? `${c.entry_date}T00:00:00.000Z`,
            performedBy:
              (c as { profiles?: { full_name: string } | null }).profiles?.full_name ?? 'Usuário removido',
          }))
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      },
    });
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    loadCondo();
  }, [loadCondo]);

  useEffect(() => {
    load();
  }, [load]);

  if (profile?.role !== 'sindico') {
    return (
      <View style={styles.container}>
        <Text style={styles.restricted}>Acesso restrito ao síndico.</Text>
      </View>
    );
  }

  const totalExecuted = data
    ? data.occurrencesResolved + data.tasksDone + data.maintenanceRecords + data.checklistDone
    : 0;
  const totalPending = data ? data.occurrencesOpen + data.tasksPending : 0;
  const total = totalExecuted + totalPending;

  async function exportPdf() {
    if (!data) return;
    setExporting(true);
    const html = buildReportHtml(PERIOD_LABEL[filter], condo, data, totalExecuted, totalPending, total);
    try {
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(html);
          win.document.close();
          win.focus();
          win.print();
        }
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Relatório' });
        }
      }
    } finally {
      setExporting(false);
    }
  }

  const hasCondoData = Boolean(
    condo && (condo.name || condo.cnpj || condo.address || condo.phone || condo.administradora)
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Relatórios</Text>
        <Pressable style={styles.exportButton} onPress={exportPdf} disabled={exporting || !data}>
          <Text style={styles.exportButtonText}>{exporting ? 'Gerando...' : 'Exportar PDF'}</Text>
        </Pressable>
      </View>

      <Card style={styles.condoCard}>
        {hasCondoData ? (
          <>
            <Text style={styles.condoName}>{condo?.name || 'Condomínio'}</Text>
            {condo?.address ? <Text style={styles.condoLine}>{condo.address}</Text> : null}
            <Text style={styles.condoLine}>
              {[
                condo?.cnpj ? `CNPJ: ${condo.cnpj}` : null,
                condo?.phone ?? null,
                condo?.administradora ? `Adm.: ${condo.administradora}` : null,
              ]
                .filter(Boolean)
                .join('  •  ')}
            </Text>
          </>
        ) : (
          <Text style={styles.condoLine}>Dados do condomínio ainda não cadastrados.</Text>
        )}
        <Pressable onPress={() => setCondoFormOpen(true)}>
          <Text style={styles.condoEditLink}>{hasCondoData ? 'Editar dados' : 'Cadastrar dados do condomínio'}</Text>
        </Pressable>
      </Card>

      <View style={styles.filterRow}>
        {(Object.keys(PERIOD_LABEL) as PeriodFilter[]).map((key) => (
          <Pressable
            key={key}
            style={[styles.filterChip, filter === key && styles.filterChipActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterChipText, filter === key && styles.filterChipTextActive]}>
              {PERIOD_LABEL[key]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading || !data ? (
        <Text style={styles.empty}>Carregando…</Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.success }]}>{totalExecuted}</Text>
              <Text style={styles.statLabel}>Executado</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.warning }]}>{totalPending}</Text>
              <Text style={styles.statLabel}>Pendente</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Executado × pendente</Text>
          <PieChart
            data={[
              { label: 'Executado', value: totalExecuted, color: colors.success },
              { label: 'Pendente', value: totalPending, color: colors.warning },
            ]}
          />

          <Text style={styles.sectionTitle}>Por categoria</Text>
          <BarChart
            data={[
              { label: 'Ordens de Serviço', value: data.occurrencesResolved + data.occurrencesOpen, color: colors.danger },
              { label: 'Tarefas', value: data.tasksDone + data.tasksPending, color: colors.warning },
              { label: 'Manutenções', value: data.maintenanceRecords, color: colors.primary },
              { label: 'Rotina', value: data.checklistDone, color: colors.success },
            ]}
          />

          <Text style={styles.sectionTitle}>Itens do período</Text>
          {CATEGORY_ORDER.map((category) => {
            const items = data.itemsByCategory[category];
            return (
              <View key={category} style={styles.categoryBlock}>
                <Text style={styles.categoryTitle}>
                  {category} ({items.length})
                </Text>
                {items.length === 0 ? (
                  <Text style={styles.itemEmpty}>Nenhum item nesse período.</Text>
                ) : (
                  items.map((item, index) => (
                    <View key={`${category}-${index}`} style={styles.itemRow}>
                      <Text style={styles.itemDate}>{new Date(item.date).toLocaleDateString('pt-BR')}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        {item.performedBy ? (
                          <Text style={styles.itemPerformedBy}>Concluído por {item.performedBy}</Text>
                        ) : null}
                      </View>
                      <Text style={styles.itemStatus}>{item.status}</Text>
                    </View>
                  ))
                )}
              </View>
            );
          })}
        </>
      )}

      <CondoSettingsModal
        visible={condoFormOpen}
        condo={condo}
        onClose={() => setCondoFormOpen(false)}
        onSaved={() => {
          setCondoFormOpen(false);
          loadCondo();
        }}
      />
    </ScrollView>
  );
}

function CondoSettingsModal({
  visible,
  condo,
  onClose,
  onSaved,
}: {
  visible: boolean;
  condo: Condominio | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [name, setName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [administradora, setAdministradora] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(condo?.name ?? '');
      setCnpj(condo?.cnpj ?? '');
      setAddress(condo?.address ?? '');
      setPhone(condo?.phone ?? '');
      setAdministradora(condo?.administradora ?? '');
      setError(null);
    }
  }, [visible, condo]);

  async function submit() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await supabase
      .from('condominios')
      .update({
        name: name.trim() || null,
        cnpj: cnpj.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        administradora: administradora.trim() || null,
      })
      .eq('id', profile.condominio_id);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    onSaved();
  }

  return (
    <AppModal visible={visible} onClose={onClose}>
      <ModalFormLayout style={styles.modalContainer}>
        <Text style={styles.modalTitle}>Dados do condomínio</Text>

        <TextField label="Nome" value={name} onChangeText={setName} placeholder="Ex: Condomínio Jardim das Flores" />
        <TextField label="CNPJ" value={cnpj} onChangeText={setCnpj} placeholder="00.000.000/0000-00" />
        <TextField label="Endereço" value={address} onChangeText={setAddress} placeholder="Rua, número, bairro, cidade" />
        <TextField label="Telefone" value={phone} onChangeText={setPhone} placeholder="(11) 0000-0000" />
        <TextField
          label="Administradora"
          value={administradora}
          onChangeText={setAdministradora}
          placeholder="Nome da administradora, se houver"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.modalButtonsRow}>
          <Button title="Cancelar" variant="secondary" onPress={onClose} style={styles.flex1} />
          <Button title="Salvar" onPress={submit} loading={saving} style={styles.flex1} />
        </View>
      </ModalFormLayout>
    </AppModal>
  );
}

function buildReportHtml(
  periodLabel: string,
  condo: Condominio | null,
  data: ReportData,
  totalExecuted: number,
  totalPending: number,
  total: number
) {
  const condoHeader = condo && (condo.name || condo.cnpj || condo.address || condo.phone || condo.administradora)
    ? `
      <h1>${condo.name ?? 'Condomínio'}</h1>
      <p class="condo-line">
        ${[
          condo.address,
          condo.cnpj ? `CNPJ: ${condo.cnpj}` : null,
          condo.phone,
          condo.administradora ? `Administradora: ${condo.administradora}` : null,
        ]
          .filter(Boolean)
          .join(' — ')}
      </p>
    `
    : '<h1>Relatório do condomínio</h1>';

  const categorySections = CATEGORY_ORDER.map((category) => {
    const items = data.itemsByCategory[category];
    const rows = items.length
      ? items
          .map(
            (item) => `
              <tr>
                <td>${new Date(item.date).toLocaleDateString('pt-BR')}</td>
                <td>${escapeHtml(item.title)}</td>
                <td>${escapeHtml(item.status)}</td>
                <td>${item.performedBy ? escapeHtml(item.performedBy) : '—'}</td>
              </tr>
            `
          )
          .join('')
      : '<tr><td colspan="4">Nenhum item nesse período.</td></tr>';

    return `
      <h3>${category} (${items.length})</h3>
      <table>
        <tr><th>Data</th><th>Item</th><th>Status</th><th>Executado por</th></tr>
        ${rows}
      </table>
    `;
  }).join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: -apple-system, Arial, sans-serif; padding: 24px; color: ${colors.textPrimary}; }
          h1 { font-size: 20px; margin-bottom: 4px; color: ${colors.primary}; }
          h3 { font-size: 15px; margin-top: 20px; margin-bottom: 6px; }
          .condo-line { font-size: 12px; color: ${colors.textSecondary}; margin: 0 0 12px; }
          .period { font-size: 13px; color: ${colors.textSecondary}; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 4px; }
          td, th { padding: 6px 8px; border-bottom: 1px solid ${colors.border}; text-align: left; font-size: 12px; }
          .totals { display: flex; gap: 24px; margin-top: 12px; }
          .totals div { font-size: 14px; }
          .totals b { font-size: 22px; display: block; }
        </style>
      </head>
      <body>
        ${condoHeader}
        <p class="period">Período do relatório: ${periodLabel}</p>
        <div class="totals">
          <div><b style="color:${colors.success}">${totalExecuted}</b>Executado</div>
          <div><b style="color:${colors.warning}">${totalPending}</b>Pendente</div>
          <div><b style="color:${colors.primary}">${total}</b>Total</div>
        </div>
        ${categorySections}
      </body>
    </html>
  `;
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, paddingBottom: spacing['3xl'] },
  restricted: { textAlign: 'center', marginTop: 40, fontFamily: fontFamily.regular, color: colors.textMuted },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.lg, color: colors.textPrimary },
  exportButton: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  exportButtonText: { fontFamily: fontFamily.bold, color: colors.textOnPrimary, fontSize: fontSize.sm },
  condoCard: { marginTop: spacing.lg },
  condoName: { fontFamily: fontFamily.semibold, fontSize: fontSize.md, color: colors.textPrimary },
  condoLine: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  condoEditLink: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.primary, marginTop: spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  filterChip: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 6, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary },
  filterChipTextActive: { color: colors.textOnPrimary },
  empty: { fontFamily: fontFamily.regular, color: colors.textMuted, marginTop: spacing.xl, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  statCard: {
    flex: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
    ...cardShadow,
  },
  statValue: { fontFamily: fontFamily.extrabold, fontSize: fontSize['2xl'] },
  statLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textPrimary, marginTop: spacing.xl, marginBottom: spacing.md },
  categoryBlock: { marginBottom: spacing.lg },
  categoryTitle: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs },
  itemEmpty: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textMuted },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemDate: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, width: 72 },
  itemTitle: { fontFamily: fontFamily.regular, fontSize: fontSize.sm, color: colors.textPrimary },
  itemPerformedBy: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 1 },
  itemStatus: { fontFamily: fontFamily.semibold, fontSize: fontSize.xs, color: colors.textSecondary },
  modalContainer: { flexGrow: 1, padding: spacing.xl, paddingTop: 60, backgroundColor: colors.background },
  modalTitle: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, marginBottom: spacing.lg, color: colors.textPrimary },
  error: { fontFamily: fontFamily.medium, color: colors.danger, marginTop: spacing.md, fontSize: fontSize.sm },
  modalButtonsRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xl },
  flex1: { flex: 1 },
});
