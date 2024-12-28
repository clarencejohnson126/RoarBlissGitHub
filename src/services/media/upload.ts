import { supabase } from '../../lib/supabase';
import { MediaUploadResponse } from './types';
import { validateFileUpload, validateYouTubeUrl } from './validation';

export class MediaUploadService {
  static async uploadFile(file: File): Promise<MediaUploadResponse> {
    try {
      // Validate file
      const errors = validateFileUpload(file);
      if (errors.length > 0) {
        throw new Error(errors.join(', '));
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Supabase upload error:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      return {
        url: publicUrl,
        type: file.type.startsWith('audio/') ? 'audio' : 'video',
        metadata: {
          size: file.size,
          format: file.type
        }
      };
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }

  static async processYouTubeUrl(url: string): Promise<MediaUploadResponse> {
    if (!validateYouTubeUrl(url)) {
      throw new Error('Invalid YouTube URL');
    }

    // This would typically call your backend API
    // For now, just return the URL
    return {
      url,
      type: 'video',
      metadata: {
        title: 'YouTube Video',
        format: 'video/youtube'
      }
    };
  }
}