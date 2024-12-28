import React, { useState } from 'react';
import { AudioUpload } from './AudioUpload';
import { VideoUrlInput } from './VideoUrlInput';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/Tabs';

interface UploadSectionProps {
  onAudioUpload: (file: File) => void;
  onVideoUrlSubmit: (url: string) => void;
}

export const UploadSection = ({ onAudioUpload, onVideoUrlSubmit }: UploadSectionProps) => {
  const [activeTab, setActiveTab] = useState('audio');

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="audio">Audio Upload</TabsTrigger>
          <TabsTrigger value="video">Video URL</TabsTrigger>
        </TabsList>
        <TabsContent value="audio">
          <AudioUpload onAudioUpload={onAudioUpload} />
        </TabsContent>
        <TabsContent value="video">
          <VideoUrlInput onUrlSubmit={onVideoUrlSubmit} />
        </TabsContent>
      </Tabs>
    </div>
  );
};