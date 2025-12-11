import { useRef, useCallback } from 'react';

// Import local sound files
import pageFlip1 from '../../sound/page-flip1-178322.mp3';
import pageFlip2 from '../../sound/page-flip2-178323.mp3';
import smallPage from '../../sound/small-page-103398.mp3';

// Multiple page flip sounds for variety
const PAGE_FLIP_SOUNDS = [
  pageFlip1,
  pageFlip2,
  smallPage,
];

interface UsePageFlipSoundOptions {
  volume?: number; // 0-1
  enabled?: boolean;
}

export const usePageFlipSound = (options: UsePageFlipSoundOptions = {}) => {
  const { volume = 0.3, enabled = true } = options;
  
  // Pre-loaded audio elements
  const audioPoolRef = useRef<HTMLAudioElement[]>([]);
  const loadedRef = useRef(false);
  const lastSoundIndexRef = useRef(-1);
  
  // Initialize audio pool on first use
  const initAudioPool = useCallback(() => {
    if (loadedRef.current || typeof window === 'undefined') return;
    
    // Create audio elements for each sound
    PAGE_FLIP_SOUNDS.forEach((src) => {
      const audio = new Audio(src);
      audio.volume = volume;
      audio.playbackRate = 1.3; // Play faster
      audio.preload = 'auto';
      audioPoolRef.current.push(audio);
    });
    
    loadedRef.current = true;
  }, [volume]);
  
  // Play a random page flip sound (avoiding same sound twice in a row)
  const playFlipSound = useCallback(() => {
    if (!enabled) return;
    
    // Initialize on first play
    if (!loadedRef.current) {
      initAudioPool();
    }
    
    const pool = audioPoolRef.current;
    if (pool.length === 0) return;
    
    // Pick a random sound (different from last one)
    let randomIndex: number;
    do {
      randomIndex = Math.floor(Math.random() * pool.length);
    } while (randomIndex === lastSoundIndexRef.current && pool.length > 1);
    
    lastSoundIndexRef.current = randomIndex;
    
    const audio = pool[randomIndex];
    if (audio) {
      // Reset and play
      audio.currentTime = 0;
      audio.volume = volume;
      audio.play().catch(() => {
        // Silently ignore autoplay restrictions
      });
    }
  }, [enabled, volume, initAudioPool]);
  
  // Update volume for all audio elements
  const setVolume = useCallback((newVolume: number) => {
    audioPoolRef.current.forEach(audio => {
      audio.volume = Math.max(0, Math.min(1, newVolume));
    });
  }, []);
  
  return {
    playFlipSound,
    setVolume,
  };
};
