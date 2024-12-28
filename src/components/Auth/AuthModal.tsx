import React, { useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../../lib/supabase';

export const AuthModal = () => {
  const [error, setError] = useState<string | null>(null);

  const handleError = (error: Error) => {
    console.error('Auth error:', error);
    let message = 'An error occurred during authentication';
    
    if (error.message.includes('Failed to fetch')) {
      message = 'Unable to connect to the authentication service. Please check your internet connection.';
    } else if (error.message.includes('Invalid login credentials')) {
      message = 'Invalid email or password. Please try again.';
    } else if (error.message.includes('Email not confirmed')) {
      message = 'Please confirm your email address before logging in.';
    }
    
    setError(message);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Connect to RoarBliss</h2>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#8B5CF6',
                  brandAccent: '#7C3AED',
                },
              },
            },
            style: {
              button: {
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
              },
              input: {
                borderRadius: '0.5rem',
                padding: '0.75rem 1rem',
              },
            },
          }}
          providers={[]}
          redirectTo={window.location.origin}
          onError={handleError}
          magicLink={false}
        />
      </div>
    </div>
  );
};