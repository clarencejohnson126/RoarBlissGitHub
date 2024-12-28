import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard/Dashboard';
import { AuthModal } from './components/Auth/AuthModal';
import { About } from './pages/About';
import { Pricing } from './pages/Pricing';
import { Contact } from './pages/Contact';
import { useAuth } from './hooks/useAuth';
import { useFormData } from './hooks/useFormData';
import { useQuoteGeneration } from './hooks/useQuoteGeneration';

const App = () => {
  const { user, loading, error: authError } = useAuth();
  const { formData, updateFormData } = useFormData();
  const { currentQuote, generateQuote } = useQuoteGeneration();
  const [selectedCategory, setSelectedCategory] = React.useState('success');
  const [selectedSpeaker, setSelectedSpeaker] = React.useState('FF7KdobWPaiR0vkcALHF');
  const [selectedSoundtrack, setSelectedSoundtrack] = React.useState('');

  const handleCategorySelect = async (category: string) => {
    setSelectedCategory(category);
    await generateQuote(category);
  };

  // Show error state if auth fails
  if (authError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-teal-400 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Connection Error</h2>
          <p className="text-gray-600 mb-4">{authError}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-teal-400 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-purple-600 via-blue-600 to-teal-400">
        <Header />
        <Routes>
          <Route path="/about" element={<About />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/" element={
            !user ? (
              <AuthModal />
            ) : (
              <div className="flex h-[calc(100vh-theme(spacing.32))]">
                <Dashboard 
                  currentQuote={currentQuote}
                  onSelectCategory={handleCategorySelect}
                  selectedCategory={selectedCategory}
                  formData={formData}
                  onFormChange={updateFormData}
                  selectedSpeaker={selectedSpeaker}
                  onSpeakerSelect={setSelectedSpeaker}
                  selectedSoundtrack={selectedSoundtrack}
                  onSoundtrackSelect={setSelectedSoundtrack}
                />
              </div>
            )
          } />
        </Routes>
      </div>
    </Router>
  );
};

export default App;