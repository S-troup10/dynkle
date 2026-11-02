import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { soundEnabled } from '@/state/prefs';
import { log } from './logger';

const SOURCES = {
  paid: require('../../assets/sounds/paid.wav'),
  failed: require('../../assets/sounds/failed.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

const players = new Map<SoundName, AudioPlayer>();

/** Plays a short cue (if sound is on). Never throws: a missing speaker mustn't break a sale. */
export function playSound(name: SoundName) {
  if (!soundEnabled()) return;
  try {
    let player = players.get(name);
    if (!player) {
      player = createAudioPlayer(SOURCES[name]);
      players.set(name, player);
    }
    player.seekTo(0).catch(() => undefined);
    player.play();
  } catch (e) {
    log.warn('Could not play sound', { name, error: e });
  }
}
