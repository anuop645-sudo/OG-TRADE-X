import { useCallback, useEffect, useRef, useState } from 'react';

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  setVolume: (vol: number) => void;
  destroy: () => void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTGlobal {
  Player: new (
    el: HTMLElement | string,
    opts: {
      height?: string | number;
      width?: string | number;
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: YTPlayerEvent) => void;
        onStateChange?: (e: YTPlayerEvent) => void;
        onError?: (e: YTPlayerEvent) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface BgMusicController {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPlaying: boolean;
  userWantsMusic: boolean;
  volume: number;
  embedError: boolean;
  playNow: () => void;
  toggleMusic: () => void;
  setVolume: (vol: number) => void;
}

interface UseYouTubeBgMusicOptions {
  videoId: string;
  active: boolean;
  soundEnabled: boolean;
}

export function useYouTubeBgMusic({
  videoId,
  active,
  soundEnabled,
}: UseYouTubeBgMusicOptions): BgMusicController {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [userWantsMusic, setUserWantsMusic] = useState(true);
  const [volume, setVolume] = useState(45);
  const [embedError, setEmbedError] = useState(false);

  const activeRef = useRef(active);
  activeRef.current = active;
  const userWantsRef = useRef(userWantsMusic);
  userWantsRef.current = userWantsMusic;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  useEffect(() => {
    let cancelled = false;

    const initPlayer = () => {
      if (cancelled || !containerRef.current || !window.YT?.Player) return;

      containerRef.current.innerHTML = '';
      const mountNode = document.createElement('div');
      containerRef.current.appendChild(mountNode);

      playerRef.current = new window.YT.Player(mountNode, {
        width: 200,
        height: 200,
        videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          loop: 1,
          playlist: videoId,
          controls: 0,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event) => {
            if (cancelled) return;
            setIsReady(true);
            event.target.setVolume(volumeRef.current);

            if (activeRef.current && userWantsRef.current) {
              if (soundEnabledRef.current) {
                event.target.unMute();
              } else {
                event.target.mute();
              }
              event.target.playVideo();
            } else {
              event.target.pauseVideo();
            }
          },
          onStateChange: (event) => {
            if (cancelled) return;
            if (event.data === 1) {
              setIsPlaying(true);
            } else if (event.data === 2 || event.data === -1) {
              setIsPlaying(false);
            } else if (
              event.data === 0 &&
              activeRef.current &&
              userWantsRef.current
            ) {
              event.target.playVideo();
            }
          },
          onError: () => {
            if (cancelled) return;
            setEmbedError(true);
          },
        },
      });
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector(
        'script[src="https://www.youtube.com/iframe_api"]'
      );
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevCallback) prevCallback();
        initPlayer();
      };
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // Ignore cleanup errors
      }
      playerRef.current = null;
    };
  }, [videoId]);

  // Sync play/pause & mute whenever active game, user preference, soundEnabled, or volume changes
  useEffect(() => {
    const player = playerRef.current;
    if (!player || !isReady) return;
    try {
      player.setVolume(volume);
      if (soundEnabled) {
        player.unMute();
      } else {
        player.mute();
      }

      if (active && userWantsMusic) {
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    } catch {
      // Ignore if player not ready
    }
  }, [active, userWantsMusic, soundEnabled, volume, isReady]);

  // Unlock unmuted playback on any user interaction while Jhandi Munda is active
  useEffect(() => {
    if (!active || !isReady) return;
    const unlock = () => {
      const player = playerRef.current;
      if (!player || !activeRef.current || !userWantsRef.current) return;
      try {
        if (soundEnabledRef.current) {
          player.unMute();
          player.setVolume(volumeRef.current);
        }
        player.playVideo();
      } catch {
        // Ignore
      }
    };

    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [active, isReady]);

  // Call synchronously inside the "Jhandi Munda" click handler for instant gesture-unlocked audio
  const playNow = useCallback(() => {
    setUserWantsMusic(true);
    const player = playerRef.current;
    if (!player) return;
    try {
      if (soundEnabledRef.current) {
        player.unMute();
        player.setVolume(volumeRef.current);
      } else {
        player.mute();
      }
      player.playVideo();
    } catch {
      // Ignore if still loading; onReady will pick up activeRef.current
    }
  }, []);

  const toggleMusic = useCallback(() => {
    const next = !userWantsRef.current;
    setUserWantsMusic(next);
    const player = playerRef.current;
    if (!player) return;
    try {
      if (next && activeRef.current) {
        if (soundEnabledRef.current) {
          player.unMute();
          player.setVolume(volumeRef.current);
        }
        player.playVideo();
      } else {
        player.pauseVideo();
      }
    } catch {
      // Ignore
    }
  }, []);

  return {
    containerRef,
    isPlaying,
    userWantsMusic,
    volume,
    embedError,
    playNow,
    toggleMusic,
    setVolume,
  };
}
