/* global jest */
// Native modules the terminal uses, replaced for Jest.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-audio', () => {
  const player = { play: jest.fn(), seekTo: jest.fn(() => Promise.resolve()) };
  return { createAudioPlayer: jest.fn(() => player), __player: player };
});
jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismissTo: jest.fn(),
    canDismiss: jest.fn(() => true),
    canGoBack: jest.fn(() => true),
  };
  return { router, useRouter: () => router, useLocalSearchParams: () => ({}), Link: ({ children }) => children };
});
