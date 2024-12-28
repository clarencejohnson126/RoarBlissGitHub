import React from 'react';

interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export const Tabs = ({ value, onValueChange, children }: TabsProps) => {
  return (
    <div className="space-y-4">
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { value, onValueChange });
        }
        return child;
      })}
    </div>
  );
};

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

export const TabsList = ({ children, className }: TabsListProps) => {
  return (
    <div className={`bg-white/10 rounded-lg p-1 ${className}`}>
      {children}
    </div>
  );
};

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  currentValue?: string;
  onValueChange?: (value: string) => void;
}

export const TabsTrigger = ({ value, children, currentValue, onValueChange }: TabsTriggerProps) => {
  const isActive = value === currentValue;

  return (
    <button
      className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
        isActive
          ? 'bg-white/10 text-white'
          : 'text-white/70 hover:text-white hover:bg-white/5'
      }`}
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </button>
  );
};

interface TabsContentProps {
  value: string;
  currentValue?: string;
  children: React.ReactNode;
}

export const TabsContent = ({ value, currentValue, children }: TabsContentProps) => {
  if (value !== currentValue) return null;
  return <div className="pt-4">{children}</div>;
};