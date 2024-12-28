import React from 'react';

export const LionLogo = ({ className = "w-24 h-24" }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Main Head Shape */}
      <path d="M30 50C35 45 40 42 45 41C50 40 55 41 58 43" />
      
      {/* Nose and Mouth */}
      <path d="M25 52C28 51 31 50 33 50C35 50 37 50.5 38 51.5" />
      <path d="M33 51C35 51.5 36.5 52 37 53" />
      
      {/* Eye and Details */}
      <path d="M42 46C43 46 44 46.2 44.5 46.8" />
      <path d="M41 45.5C42.5 45.5 43.5 46 44 47" />
      <ellipse cx="43" cy="46" rx="1" ry="0.5" fill="currentColor" />
      
      {/* Majestic Mane - Multiple Detailed Layers */}
      {/* Upper Mane */}
      <path d="M45 25C40 26 35 28 32 31C29 34 27 38 26 42" />
      <path d="M48 23C44 24 40 26 37 29C34 32 32 36 31 40" />
      <path d="M52 22C47 23 43 25 40 28C37 31 35 35 34 39" />
      <path d="M56 22C51 23 47 25 44 28C41 31 39 35 38 39" />
      <path d="M60 23C55 24 51 26 48 29C45 32 43 36 42 40" />
      
      {/* Side Mane */}
      <path d="M65 25C60 27 56 30 53 34C50 38 48 42 47 46" />
      <path d="M68 28C63 30 59 33 56 37C53 41 51 45 50 49" />
      <path d="M70 32C65 34 61 37 58 41C55 45 53 49 52 53" />
      <path d="M71 36C66 38 62 41 59 45C56 49 54 53 53 57" />
      
      {/* Lower Mane */}
      <path d="M70 40C65 43 61 47 58 51C55 55 53 59 52 63" />
      <path d="M68 45C63 48 59 52 56 56C53 60 51 64 50 68" />
      <path d="M65 50C60 53 56 57 53 61C50 65 48 69 47 73" />
      
      {/* Face Details */}
      <path d="M35 48C36 47.5 37 47.2 38 47.5" /> {/* Brow */}
      <path d="M34 53C35 52.8 36 52.9 37 53.2" /> {/* Nose Detail */}
      
      {/* Whiskers */}
      <path d="M32 53C30 53.5 28 54 26 54.5" strokeWidth="0.3" />
      <path d="M32 54C30 54.8 28 55.5 26 56" strokeWidth="0.3" />
      <path d="M32 55C30 55.8 28 56.5 26 57" strokeWidth="0.3" />
    </svg>
  );
};