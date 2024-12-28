import React from 'react';
import { Link } from 'react-router-dom';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
}

export const NavLink = ({ href, children }: NavLinkProps) => {
  return (
    <Link
      to={href}
      className="text-white/90 hover:text-white px-4 py-2 rounded-lg transition-colors hover:bg-white/10"
    >
      {children}
    </Link>
  );
};