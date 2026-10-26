import AsyncStorage from '@react-native-async-storage/async-storage';

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown) {
    try {
      if (value === null || value === undefined) await AsyncStorage.removeItem(key);
      else await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage is best-effort; the terminal re-pairs if it loses its token.
    }
  },
};
