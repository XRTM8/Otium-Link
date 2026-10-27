import { describe, it, expect } from 'vitest';
import { playReceiveChime, playSendChime } from '../audioFeedback';

describe('Audio Feedback', () => {
  it('does nothing when disabled', () => {
    expect(() => playReceiveChime(false)).not.toThrow();
    expect(() => playSendChime(false)).not.toThrow();
  });

  it('runs safely in environments without AudioContext', () => {
    expect(() => playReceiveChime(true)).not.toThrow();
    expect(() => playSendChime(true)).not.toThrow();
  });
});
