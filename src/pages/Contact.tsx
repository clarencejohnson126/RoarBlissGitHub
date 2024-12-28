import React from 'react';
import { Mail, Phone, Globe, Instagram, Twitter, Facebook } from 'lucide-react';

const ContactMethod = ({ 
  icon: Icon, 
  label, 
  value, 
  href 
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  href: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-4 p-6 bg-white/10 rounded-lg backdrop-blur-sm hover:bg-white/20 transition-colors"
  >
    <Icon className="w-6 h-6 text-purple-300" />
    <div>
      <div className="font-medium text-white/80">{label}</div>
      <div className="text-white">{value}</div>
    </div>
  </a>
);

const SocialLink = ({ 
  icon: Icon, 
  platform, 
  username, 
  href 
}: {
  icon: React.ElementType;
  platform: string;
  username: string;
  href: string;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-3 p-4 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
  >
    <Icon className="w-5 h-5 text-purple-300" />
    <span className="text-white">{username}</span>
  </a>
);

export const Contact = () => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">
            Contact Us
          </h1>
          <p className="text-xl text-white/90">
            We'd love to hear from you! Our team is here to help.
          </p>
        </div>

        {/* Contact Methods Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <ContactMethod
            icon={Mail}
            label="Email us at"
            value="support@roarbliss.com"
            href="mailto:support@roarbliss.com"
          />
          <ContactMethod
            icon={Phone}
            label="Call us"
            value="+49 123 456 789"
            href="tel:+49123456789"
          />
          <ContactMethod
            icon={Globe}
            label="Visit our website"
            value="www.roarbliss.com"
            href="https://www.roarbliss.com"
          />
        </div>

        {/* Social Media Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-white mb-6">
            Follow us on social media
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SocialLink
              icon={Instagram}
              platform="Instagram"
              username="@roarblissapp"
              href="https://instagram.com/roarblissapp"
            />
            <SocialLink
              icon={Twitter}
              platform="Twitter"
              username="@roarbliss"
              href="https://twitter.com/roarbliss"
            />
            <SocialLink
              icon={Facebook}
              platform="Facebook"
              username="RoarBlissOfficial"
              href="https://facebook.com/RoarBlissOfficial"
            />
          </div>
        </div>

        {/* Call to Action */}
        <div className="text-center">
          <p className="text-white/90 text-lg">
            Let's roar together! 🚀
          </p>
        </div>
      </div>
    </div>
  );
};