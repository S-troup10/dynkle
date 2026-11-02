import { useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { LogEntry } from '@dynkle/shared';
import { BackHeader } from '@/components/Header';
import { Button, Card, MAX_FONT_SCALE, Screen, T } from '@/components/ui';
import { touchAdmin, useAdminGuard } from '@/hooks/useAdmin';
import { useLogs } from '@/hooks/useLogs';
import { formatTime } from '@/lib/format';
import { log } from '@/lib/logger';
import { sendLogsToSupport } from '@/lib/supportLogs';
import { colors, fonts } from '@/theme';

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  debug: colors.muted,
  info: colors.greenDeep,
  warn: colors.amberDeep,
  error: colors.red,
};

/** Admin → Logs: what the terminal has been doing, newest first. */
export default function Logs() {
  useAdminGuard();
  const entries = useLogs();
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const newestFirst = [...entries].reverse();

  return (
    <Screen>
      <BackHeader title="Logs" />
      <View style={s.actions}>
        <Button
          title="Send to support"
          loading={sending}
          testID="send-logs"
          onPress={async () => {
            touchAdmin();
            setSending(true);
            setResult((await sendLogsToSupport()).message);
            setSending(false);
          }}
        />
        {result ? (
          <T v="small" accessibilityLiveRegion="polite">
            {result}
          </T>
        ) : null}
      </View>
      <FlatList
        data={newestFirst}
        keyExtractor={(e, i) => `${e.at}-${i}`}
        contentContainerStyle={s.list}
        ListEmptyComponent={<T style={{ textAlign: 'center', marginTop: 40 }}>Nothing logged yet.</T>}
        renderItem={({ item }) => (
          <Card style={s.entry}>
            <View style={s.head}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[s.level, { color: LEVEL_COLOR[item.level] }]}>
                {item.level.toUpperCase()}
              </Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={s.time}>
                {formatTime(item.at)}
              </Text>
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={s.message}>
              {item.message}
            </Text>
            {item.context && Object.keys(item.context).length > 0 ? (
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={s.context}>
                {JSON.stringify(item.context)}
              </Text>
            ) : null}
          </Card>
        )}
        ListFooterComponent={
          entries.length > 0 ? (
            <Button
              title="Clear logs"
              kind="ghost"
              onPress={() => {
                touchAdmin();
                log.clear();
              }}
            />
          ) : null
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  actions: { paddingHorizontal: 20, gap: 8, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 30, gap: 8 },
  entry: { padding: 12, gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  level: { fontFamily: fonts.bodySemi, fontSize: 11, letterSpacing: 1 },
  time: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  message: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  context: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
});
