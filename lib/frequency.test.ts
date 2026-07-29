import { describe, expect, it } from 'vitest';
import { getMaintenanceUrgency, getPeriodKey } from './frequency';

// getPeriodKey mistura Date local (getDate/setDate) com serialização UTC
// (toISOString) — fixamos o fuso do processo de teste em UTC pra esses
// casos não dependerem do fuso horário de quem roda `npm test`.
process.env.TZ = 'UTC';

// Horário fixo em meio-dia UTC pra não flutuar de dia dependendo do fuso
// horário de quem roda o teste (toDateOnly usa toISOString, que é UTC).
function utcNoon(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`);
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysDateOnly(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('getPeriodKey', () => {
  it('diária retorna a própria data', () => {
    expect(getPeriodKey('diaria', utcNoon('2026-07-15'))).toBe('2026-07-15');
  });

  it('semanal retorna a segunda-feira da semana (referência numa quarta)', () => {
    // 2026-07-15 é uma quarta-feira.
    expect(getPeriodKey('semanal', utcNoon('2026-07-15'))).toBe('2026-07-13');
  });

  it('semanal retorna a segunda-feira anterior quando a referência é domingo', () => {
    // 2026-07-19 é um domingo — deve voltar pra segunda 2026-07-13, não pra
    // segunda da semana seguinte.
    expect(getPeriodKey('semanal', utcNoon('2026-07-19'))).toBe('2026-07-13');
  });

  it('mensal retorna o dia 1 do mês', () => {
    expect(getPeriodKey('mensal', utcNoon('2026-07-15'))).toBe('2026-07-01');
  });

  it('trimestral retorna o início do trimestre corrente', () => {
    expect(getPeriodKey('trimestral', utcNoon('2026-08-20'))).toBe('2026-07-01');
    expect(getPeriodKey('trimestral', utcNoon('2026-01-05'))).toBe('2026-01-01');
    expect(getPeriodKey('trimestral', utcNoon('2026-12-31'))).toBe('2026-10-01');
  });

  it('semestral retorna janeiro ou julho conforme o mês', () => {
    expect(getPeriodKey('semestral', utcNoon('2026-03-10'))).toBe('2026-01-01');
    expect(getPeriodKey('semestral', utcNoon('2026-09-10'))).toBe('2026-07-01');
  });

  it('anual retorna 1º de janeiro do ano', () => {
    expect(getPeriodKey('anual', utcNoon('2026-11-30'))).toBe('2026-01-01');
  });
});

describe('getMaintenanceUrgency', () => {
  it('classifica uma data passada como vencido', () => {
    expect(getMaintenanceUrgency(addDaysDateOnly(-1))).toBe('vencido');
  });

  it('classifica hoje como vence_em_breve', () => {
    expect(getMaintenanceUrgency(todayDateOnly())).toBe('vence_em_breve');
  });

  it('classifica uma data dentro de 7 dias como vence_em_breve', () => {
    expect(getMaintenanceUrgency(addDaysDateOnly(7))).toBe('vence_em_breve');
  });

  it('classifica uma data com mais de 7 dias como em_dia', () => {
    expect(getMaintenanceUrgency(addDaysDateOnly(8))).toBe('em_dia');
  });
});
