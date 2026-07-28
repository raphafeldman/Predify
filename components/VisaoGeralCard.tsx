import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardShadow, colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';
import { Card } from './ui/Card';

export interface VisaoGeralStat {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  caption: string;
  captionColor: string;
}

export type VisaoGeralPeriod = 'hoje' | 'semana' | 'mes';

export const PERIOD_LABEL: Record<VisaoGeralPeriod, string> = {
  hoje: 'Hoje',
  semana: 'Essa semana',
  mes: 'Esse mês',
};

function PeriodPicker({
  value,
  onChange,
}: {
  value: VisaoGeralPeriod;
  onChange: (period: VisaoGeralPeriod) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.periodPill} onPress={() => setOpen(true)}>
        <Text style={styles.periodText}>{PERIOD_LABEL[value]}</Text>
        <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.periodBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.periodMenu}>
            {(Object.keys(PERIOD_LABEL) as VisaoGeralPeriod[]).map((key) => (
              <Pressable
                key={key}
                style={styles.periodOption}
                onPress={() => {
                  onChange(key);
                  setOpen(false);
                }}
              >
                <Text style={[styles.periodOptionText, key === value && styles.periodOptionTextActive]}>
                  {PERIOD_LABEL[key]}
                </Text>
                {key === value ? <Ionicons name="checkmark" size={16} color={colors.primary} /> : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// Card "Visão geral" no estilo do app preview do manual da marca: título +
// período, e um grid 2x2 de indicadores (ícone, número, rótulo, legenda).
// O período só fica clicável quando o chamador passa onPeriodChange —
// senão (ex: card do funcionário) mostra só o rótulo, sem interação.
export function VisaoGeralCard({
  title = 'Visão geral',
  period = 'mes',
  onPeriodChange,
  stats,
}: {
  title?: string;
  period?: VisaoGeralPeriod;
  onPeriodChange?: (period: VisaoGeralPeriod) => void;
  stats: VisaoGeralStat[];
}) {
  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        {onPeriodChange ? (
          <PeriodPicker value={period} onChange={onPeriodChange} />
        ) : (
          <View style={styles.periodPill}>
            <Text style={styles.periodText}>{PERIOD_LABEL[period]}</Text>
            <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
          </View>
        )}
      </View>
      <View style={styles.grid}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statBox}>
            <View style={[styles.iconWrap, { backgroundColor: `${stat.iconColor}1A` }]}>
              <Ionicons name={stat.icon} size={16} color={stat.iconColor} />
            </View>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={[styles.statCaption, { color: stat.captionColor }]}>{stat.caption}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fontFamily.bold, fontSize: fontSize.md, color: colors.textPrimary },
  periodPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  periodText: { fontFamily: fontFamily.semibold, fontSize: fontSize.xs, color: colors.textSecondary },
  periodBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  periodMenu: {
    width: 200,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    ...cardShadow,
  },
  periodOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  periodOptionText: { fontFamily: fontFamily.medium, fontSize: fontSize.sm, color: colors.textPrimary },
  periodOptionTextActive: { fontFamily: fontFamily.bold, color: colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.lg, marginHorizontal: -spacing.xs },
  statBox: { width: '50%', paddingHorizontal: spacing.xs, marginBottom: spacing.md },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: { fontFamily: fontFamily.extrabold, fontSize: fontSize['2xl'], color: colors.textPrimary },
  statLabel: { fontFamily: fontFamily.medium, fontSize: fontSize.xs, color: colors.textSecondary, marginTop: 2 },
  statCaption: { fontFamily: fontFamily.semibold, fontSize: fontSize.xs, marginTop: 2 },
});
