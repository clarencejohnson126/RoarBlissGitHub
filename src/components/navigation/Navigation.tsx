import React from 'react';
import { NavLink } from './NavLink';

export const Navigation = () => {
  return (
    <nav className="flex items-center space-x-2">
      <NavLink href="/about">About</NavLink>
      <NavLink href="/pricing">Pricing</NavLink>
      <NavLink href="/contact">Contact</NavLink>
    </nav>
  );
};