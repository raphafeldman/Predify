import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Line as SvgLine } from 'react-native-svg';
import { colors, fontFamily, fontSize, radius, spacing } from '../lib/theme';

export interface Fatia {
  label: string;
  value: number;
  color: string;
}

/**
 * Barras horizontais em vez de pizza.
 *
 * Comparar fatias de pizza exige julgar ângulos, que é justamente o que
 * o olho faz pior; comprimento lado a lado é imediato. E o rótulo cabe
 * escrito por extenso, sem legenda separada para consultar.
 */
export function BarrasHorizontais({ data, vazio }: { data: Fatia[]; vazio?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const max = Math.max(1, ...data.map((d) => d.value));
  const comValor = data.filter((d) => d.value > 0);

  if (!comValor.length) {
    return <Text style={styles.vazio}>{vazio ?? 'Sem dados no período.'}</Text>;
  }

  return (
    <View style={styles.barras}>
      {comValor.map((d) => {
        const pct = total ? Math.round((d.value / total) * 100) : 0;
        return (
          <View key={d.label} style={styles.linhaBarra}>
            <Text style={styles.rotuloBarra} numberOfLines={1}>
              {d.label}
            </Text>
            <View style={styles.trilho}>
              <View
                style={[
                  styles.preenchimento,
                  { width: `${Math.max(2, (d.value / max) * 100)}%`, backgroundColor: d.color },
                ]}
              />
            </View>
            <Text style={styles.valorBarra}>
              {d.value}
              <Text style={styles.percentual}> · {pct}%</Text>
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export interface PontoTempo {
  /** Rótulo curto do eixo — dia ou mês. */
  label: string;
  value: number;
}

/**
 * Evolução no tempo. Responde "está melhorando ou piorando?", que
 * nenhum total isolado responde.
 */
export function EvolucaoNoTempo({
  data,
  color = colors.primary,
  altura = 120,
}: {
  data: PontoTempo[];
  color?: string;
  altura?: number;
}) {
  if (data.length < 2) {
    return <Text style={styles.vazio}>Período curto demais para mostrar evolução.</Text>;
  }

  const largura = 320;
  const padX = 8;
  const padY = 10;
  const max = Math.max(1, ...data.map((d) => d.value));
  const passo = (largura - padX * 2) / (data.length - 1);
  const y = (v: number) => padY + (1 - v / max) * (altura - padY * 2);

  const pontos = data.map((d, i) => ({ x: padX + i * passo, y: y(d.value), ...d }));
  const linha = pontos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const area = `${linha} L ${pontos[pontos.length - 1].x} ${altura} L ${pontos[0].x} ${altura} Z`;

  // Mostra no máximo 6 rótulos: mais que isso vira borrão no celular.
  const passoRotulo = Math.max(1, Math.ceil(data.length / 6));

  return (
    <View>
      <Svg width="100%" height={altura} viewBox={`0 0 ${largura} ${altura}`}>
        <SvgLine x1={padX} y1={altura - padY} x2={largura - padX} y2={altura - padY} stroke={colors.border} strokeWidth={1} />
        <Path d={area} fill={color} fillOpacity={0.12} />
        <Path d={linha} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        {pontos.map((p) => (
          <Circle key={p.label} cx={p.x} cy={p.y} r={3} fill={color} />
        ))}
      </Svg>
      <View style={styles.eixo}>
        {data.map((d, i) => (
          <Text key={d.label} style={styles.rotuloEixo}>
            {i % passoRotulo === 0 ? d.label : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

export interface Destaque {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}

/**
 * Os números que respondem antes de qualquer gráfico. Ficam no topo
 * porque, na maioria das vezes, são a resposta inteira.
 */
export function Destaques({ itens }: { itens: Destaque[] }) {
  return (
    <View style={styles.destaques}>
      {itens.map((d) => (
        <View key={d.label} style={styles.destaque}>
          <Text style={[styles.destaqueValor, d.color ? { color: d.color } : null]}>{d.value}</Text>
          <Text style={styles.destaqueLabel}>{d.label}</Text>
          {d.hint ? <Text style={styles.destaqueHint}>{d.hint}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  vazio: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    paddingVertical: spacing.md,
  },
  barras: { gap: spacing.sm },
  linhaBarra: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rotuloBarra: {
    width: 110,
    fontFamily: fontFamily.medium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
  },
  trilho: {
    flex: 1,
    height: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  preenchimento: { height: '100%', borderRadius: radius.pill },
  valorBarra: {
    minWidth: 64,
    textAlign: 'right',
    fontFamily: fontFamily.bold,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  percentual: { fontFamily: fontFamily.regular, color: colors.textMuted, fontSize: fontSize.xs },
  eixo: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  rotuloEixo: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  destaques: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  destaque: {
    flexGrow: 1,
    flexBasis: 140,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  destaqueValor: { fontFamily: fontFamily.extrabold, fontSize: fontSize.xl, color: colors.textPrimary },
  destaqueLabel: { fontFamily: fontFamily.semibold, fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  destaqueHint: { fontFamily: fontFamily.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
});
