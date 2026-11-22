import React from 'react';
import { BgMusicController } from '../hooks/useYouTubeBgMusic';

interface YouTubeBgMusicProps {
  videoId: string;
  soundEnabled: boolean;
  controller: BgMusicController;
}

export const YouTubeBgMusic: React.FC<YouTubeBgMusicProps> = () => {
  return null;
};
