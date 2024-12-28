import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Music } from 'lucide-react';

interface AudioUploadProps {
  onAudioUpload: (file: File) => void;
}

export const AudioUpload = ({ onAudioUpload }: AudioUploadProps) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      onAudioUpload(file);
    }
  }, [onAudioUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/mpeg': ['.mp3'],
      'audio/wav': ['.wav']
    },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
        isDragActive ? 'border-purple-400 bg-purple-50/5' : 'border-white/20 hover:border-white/40'
      }`}
    >
      <input {...getInputProps()} />
      <Music className="mx-auto h-12 w-12 text-white/60" />
      <p className="mt-2 text-white/80">
        {isDragActive
          ? 'Drop your audio file here...'
          : 'Drag and drop your audio file here, or click to select'}
      </p>
      <p className="mt-1 text-sm text-white/60">Supports MP3 and WAV files</p>
    </div>
  );
};