import React from 'react';
import { Link } from 'react-router-dom';
import { Navigation } from './navigation/Navigation';
import { LionLogo } from './icons/LionLogo';

export const Header = () => {
  return (
    <header className="w-full bg-gradient-to-r from-purple-600 via-blue-600 to-teal-400">
      <div className="container mx-auto px-4">
        {/* Top Navigation Bar */}
        <div className="h-16 flex items-center justify-between">
          {/* Logo and Brand */}
          <Link to="/" className="flex items-center gap-2">
            <LionLogo className="w-8 h-8 text-white" />
            <span className="text-xl font-bold text-white">RoarBliss</span>
          </Link>

          {/* Navigation Links */}
          <Navigation />
        </div>

        {/* Hero Section */}
        <div className="py-12 text-center">
          <h1 className="text-4xl font-bold text-white mb-4">
            Transform Your Motivational Speeches with AI
          </h1>
          <p className="text-xl text-white/90">
            Create powerful, personalized speeches in any voice or language
          </p>
        </div>
      </div>
    </header>
  );
};