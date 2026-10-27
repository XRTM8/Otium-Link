import { describe, it, expect } from 'vitest';
import {
  playReceiveChime,
  playSendChime,
  playSuccessChime,
  playWarningChime,
  playDropChime,
  playDeleteChime,
} from '../audioFeedback';

describe('Audio Feedback', () => {
  it('does nothing when disabled', () => {
    expect(() => playReceiveChime(false)).not.toThrow();
    expect(() => playSendChime(false)).not.toThrow();
    expect(() => playSuccessChime(false)).not.toThrow();
    expect(() => playWarningChime(false)).not.toThrow();
    expect(() => playDropChime(false)).not.toThrow();
    expect(() => playDeleteChime(false)).not.toThrow();
  });

  it('runs safely in environments without AudioContext', () => {
    expect(() => playReceiveChime(true)).not.toThrow();
    expect(() => playSendChime(true)).not.toThrow();
    expect(() => playSuccessChime(true)).not.toThrow();
    expect(() => playWarningChime(true)).not.toThrow();
    expect(() => playDropChime(true)).not.toThrow();
    expect(() => playDeleteChime(true)).not.toThrow();
  });
});
