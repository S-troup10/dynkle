import { Component, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { log } from '@/lib/logger';
import { kiosk } from '@/native/hardware';
import { colors, fonts } from '@/theme';
import { Button, MAX_FONT_SCALE } from './ui';

interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render crash shows a restart screen (and is logged)
 * instead of a blank kiosk the merchant can't leave.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    log.error('Screen crashed', { error, stack: error.stack, componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={s.wrap} accessibilityRole="alert">
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={s.title}>
          Something went wrong
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={s.body}>
          The terminal hit an unexpected problem. Any sale in progress is saved and will come back after a restart.
        </Text>
        <Button title="Restart terminal" onPress={() => kiosk.restart()} testID="crash-restart" />
        <Button title="Try again" kind="ghost" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 28, gap: 16 },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, textAlign: 'center' },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
});
