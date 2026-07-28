import { useEffect, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { colors, fontFamily, fontSize, radius } from '../lib/theme';

function isoToBr(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function brToIso(br: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m}-${d}`;
}

function maskInput(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length > 4) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
}

interface Props {
  /** Data em formato ISO (AAAA-MM-DD), ou '' se vazia. */
  value: string;
  onChangeISO: (iso: string) => void;
  placeholder?: string;
}

/** Campo de data no formato DD/MM/AAAA (com máscara automática) que expõe
 * o valor pro componente pai já convertido para ISO, formato que o banco usa. */
export function DateInput({ value, onChangeISO, placeholder = 'DD/MM/AAAA' }: Props) {
  const [text, setText] = useState(() => isoToBr(value));

  useEffect(() => {
    setText(isoToBr(value));
  }, [value]);

  function handleChange(raw: string) {
    const masked = maskInput(raw);
    setText(masked);
    onChangeISO(brToIso(masked) ?? '');
  }

  return (
    <TextInput
      style={styles.input}
      value={text}
      onChangeText={handleChange}
      placeholder={placeholder}
      keyboardType="number-pad"
      maxLength={10}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.regular,
    fontSize: fontSize.base,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
  },
});
