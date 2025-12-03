import { sound } from '@pixi/sound';
import { useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';
import volumeImg from '../../../assets/volume.svg';
import { api } from '../../../convex/_generated/api';
import Button from './Button';

export default function MusicButton() {
  const musicUrl = useQuery(api.music.getBackgroundMusic);
  const [isPlaying, setPlaying] = useState(false);

  useEffect(() => {
    if (musicUrl) {
      sound.add('background', musicUrl).loop = true;
    }
  }, [musicUrl]);

  const flipSwitch = async () => {
    if (isPlaying) {
      try {
        const inst = (window as any).__pokeworldMusicInstance;
        if (inst && typeof inst.stop === 'function') {
          inst.stop();
        } else {
          sound.stop('background');
        }
      } catch (e) {
        try {
          sound.stop('background');
        } catch {}
      }
      (window as any).pokeworldMusicPlaying = false;
      (window as any).__pokeworldMusicInstance = undefined;
      window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: false } }));
    } else {
      // stop any stray instance before playing
      try {
        const prev = (window as any).__pokeworldMusicInstance;
        if (prev && typeof prev.stop === 'function') prev.stop();
      } catch {}
      const instance = await sound.play('background');
      (window as any).__pokeworldMusicInstance = instance;
      (window as any).pokeworldMusicPlaying = true;
      window.dispatchEvent(new CustomEvent('pokeworld:music', { detail: { isPlaying: true } }));
    }
    setPlaying(!isPlaying);
  };

  useEffect(() => {
    const handler = (e: any) => {
      try {
        const detail = e?.detail;
        if (detail && typeof detail.isPlaying === 'boolean') {
          setPlaying(!!detail.isPlaying);
        }
      } catch (err) {
        // ignore
      }
    };
    window.addEventListener('pokeworld:music', handler as EventListener);
    return () => window.removeEventListener('pokeworld:music', handler as EventListener);
  }, []);

  const handleKeyPress = useCallback(
    (event: { key: string }) => {
      if (event.key === 'm' || event.key === 'M') {
        void flipSwitch();
      }
    },
    [flipSwitch],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  return (
    <>
      <Button
        onClick={() => void flipSwitch()}
        className="hidden lg:block"
        title="Play AI generated music (press m to play/mute)"
        imgUrl={volumeImg}
      >
        {isPlaying ? 'Mute' : 'Music'}
      </Button>
    </>
  );
}
