import React from 'react';
import { Zap, Globe, Youtube, Music } from 'lucide-react';

const Feature = ({ icon: Icon, title, description }: { 
  icon: React.ElementType;
  title: string;
  description: string;
}) => (
  <div className="flex gap-4 p-6 bg-white/10 rounded-lg backdrop-blur-sm">
    <Icon className="w-6 h-6 text-purple-300 shrink-0" />
    <div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-white/80">{description}</p>
    </div>
  </div>
);

export const About = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            About RoarBliss
          </h1>
          <p className="text-xl text-white/90">
            The ultimate motivational companion designed to inspire, empower, and uplift!
          </p>
        </div>

        {/* Main Content */}
        <div className="prose prose-invert mx-auto mb-12">
          <p className="text-lg text-white/90 leading-relaxed">
            Our app lets you create personalized motivational experiences like never before. 
            Using advanced AI technology, we bring the voices of your favorite motivational 
            speakers to life, tailor-made just for you.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <Feature
            icon={Globe}
            title="Language Translation"
            description="Translate uploaded audio and video files into your preferred language."
          />
          <Feature
            icon={Zap}
            title="Custom Keywords"
            description="Personalize motivational videos with custom keywords that resonate with your goals."
          />
          <Feature
            icon={Youtube}
            title="YouTube Integration"
            description="Fetch and edit content directly from YouTube to keep you inspired."
          />
          <Feature
            icon={Music}
            title="Full Customization"
            description="Add instrumental music, create motivational quotes, and customize dialects."
          />
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <p className="text-white/90 mb-6">
            Whether you're seeking daily inspiration or creating unique motivational content, 
            RoarBliss is here to help you roar through your challenges and reach new heights 
            of success.
          </p>
        </div>
      </div>
    </div>
  );
};