import React, { useEffect } from 'react';
import { Music, Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { useSoundtracks } from '../../hooks/useSoundtracks';
import { useAudio } from '../../hooks/useAudio';

interface SoundtrackSelectorProps {
  selectedSoundtrack: string;
  onSelect: (id: string) => void;
}

export const SoundtrackSelector = ({ selectedSoundtrack, onSelect }: SoundtrackSelectorProps) => {
  const { soundtracks, isLoading, error: soundtrackError } = useSoundtracks();
  const { play, stop, isPlaying, error: audioError } = useAudio();
  const [playingTrackId, setPlayingTrackId] = React.useState<string | null>(null);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  const handlePlayToggle = async (trackId: string, previewUrl: string) => {
    if (playingTrackId === trackId) {
      stop();
      setPlayingTrackId(null);
    } else {
      try {
        setPlayingTrackId(trackId);
        await play(previewUrl);
      } catch (error) {
        setPlayingTrackId(null);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 text-center text-white/70">
        <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
        <p className="text-sm">Loading soundtracks...</p>
      </div>
    );
  }

  const error = soundtrackError || audioError;

  return (
    <div className="py-2 space-y-1">
      {error && (
        <div className="px-2 py-1.5 text-sm text-red-400 flex items-center gap-2 bg-red-400/10 rounded">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}
      
      {soundtracks.map((track) => (
        <div
          key={track.id}
          className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
            selectedSoundtrack === track.id
              ? 'bg-purple-500/20 text-purple-300'
              : 'text-white/70 hover:bg-white/10'
          }`}
        >
          <button
            onClick={() => onSelect(track.id)}
            className="flex items-center flex-1 text-left"
          >
            <Music className="w-4 h-4 mr-2" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{track.name}</div>
              <div className="text-xs opacity-70 truncate">{track.composer}</div>
            </div>
          </button>
          {track.previewUrl && (
            <button
              onClick={() => handlePlayToggle(track.id, track.previewUrl)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title={playingTrackId === track.id ? 'Pause' : 'Play preview'}
            >
              {playingTrackId === track.id ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};