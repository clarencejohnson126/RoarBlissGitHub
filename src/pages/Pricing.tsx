import React from 'react';
import { Check } from 'lucide-react';

interface PlanFeature {
  included: boolean;
  text: string;
}

interface PricingPlan {
  name: string;
  price: string;
  description: string;
  features: PlanFeature[];
  buttonText: string;
  popular?: boolean;
}

const PricingCard = ({ plan }: { plan: PricingPlan }) => (
  <div className={`p-6 rounded-lg backdrop-blur-sm ${
    plan.popular ? 'bg-white/20 ring-2 ring-purple-400' : 'bg-white/10'
  }`}>
    <div className="text-center mb-6">
      <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
      <div className="text-3xl font-bold text-white mb-2">{plan.price}</div>
      <p className="text-white/80">{plan.description}</p>
    </div>
    <ul className="space-y-4 mb-6">
      {plan.features.map((feature, index) => (
        <li key={index} className="flex items-center gap-3">
          <Check className={`w-5 h-5 ${
            feature.included ? 'text-green-400' : 'text-gray-400'
          }`} />
          <span className={`${
            feature.included ? 'text-white' : 'text-white/60'
          }`}>{feature.text}</span>
        </li>
      ))}
    </ul>
    <button className={`w-full py-2 px-4 rounded-lg font-medium transition-colors ${
      plan.popular
        ? 'bg-purple-500 hover:bg-purple-600 text-white'
        : 'bg-white/20 hover:bg-white/30 text-white'
    }`}>
      {plan.buttonText}
    </button>
  </div>
);

export const Pricing = () => {
  const plans: PricingPlan[] = [
    {
      name: "Free Plan",
      price: "€0",
      description: "Perfect for exploring the app's basic features",
      features: [
        { included: true, text: "Limited translations" },
        { included: true, text: "One custom video per month" },
        { included: true, text: "Basic customization" },
        { included: false, text: "Priority processing" },
        { included: false, text: "Advanced features" }
      ],
      buttonText: "Get Started"
    },
    {
      name: "Motivator Plan",
      price: "€9.99/mo",
      description: "Ideal for personal growth enthusiasts",
      features: [
        { included: true, text: "Unlimited translations" },
        { included: true, text: "Personalized video editing" },
        { included: true, text: "Keyword customization" },
        { included: true, text: "Priority support" },
        { included: false, text: "API access" }
      ],
      buttonText: "Start Free Trial",
      popular: true
    },
    {
      name: "Champion Plan",
      price: "€29.99/mo",
      description: "For serious motivational content creators",
      features: [
        { included: true, text: "All Motivator features" },
        { included: true, text: "Priority processing" },
        { included: true, text: "Exclusive speaker content" },
        { included: true, text: "Advanced customization" },
        { included: true, text: "API access" }
      ],
      buttonText: "Start Free Trial"
    }
  ];

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-4">
          Simple, Transparent Pricing
        </h1>
        <p className="text-xl text-white/90">
          Choose the plan that best fits your needs
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {plans.map((plan, index) => (
          <PricingCard key={index} plan={plan} />
        ))}
      </div>

      <div className="mt-12 text-center">
        <p className="text-white/90 mb-4">
          All plans come with a 7-day free trial
        </p>
        <p className="text-white/70">
          Enterprise plans with custom pricing available for teams and organizations
        </p>
      </div>
    </div>
  );
};