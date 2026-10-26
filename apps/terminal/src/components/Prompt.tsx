import { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fonts, radius, shadows } from '@/theme';
import { Button } from './ui';

/** Small single-field dialog (cross-platform replacement for Alert.prompt). */
export function PromptDialog({
  visible,
  title,
  initial = '',
  placeholder,
  confirm = 'Save',
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  placeholder?: string;
  confirm?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal transparent visible={visible} animationType="fade" onShow={() => setValue(initial)} onRequestClose={onCancel}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>{title}</Text>
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            autoFocus
            style={s.input}
            testID="prompt-input"
            onSubmitEditing={() => value.trim() && onSubmit(value.trim())}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Cancel" kind="secondary" style={{ flex: 1, height: 50 }} onPress={onCancel} />
            <Button title={confirm} style={{ flex: 1, height: 50 }} disabled={!value.trim()} onPress={() => onSubmit(value.trim())} testID="prompt-ok" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.white, borderRadius: radius.sheet, padding: 22, gap: 16, ...shadows.raised },
  title: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.orange,
    paddingHorizontal: 14,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
  },
});
