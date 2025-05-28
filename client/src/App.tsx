import React from 'react';
import { ChakraProvider, Box, createStandaloneToast } from '@chakra-ui/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import { ContentStoreProvider } from './contexts/ContentStoreContext';
import { ServiceProvider } from './contexts/ServiceContext';
import { theme } from './theme';

// Create standalone toast
const { ToastContainer } = createStandaloneToast({ theme });
import HomePage from './pages/HomePage';
import SessionPage from './pages/SessionPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * Main application component
 */
const App: React.FC = () => {
  return (
    <>
      <ChakraProvider theme={theme}>
        <ServiceProvider>
          <SocketProvider>
            <ContentStoreProvider>
              <Router>
                <Box minH="100vh" bg="gray.50">
                  <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/session/:sessionId" element={<SessionPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Box>
              </Router>
            </ContentStoreProvider>
          </SocketProvider>
        </ServiceProvider>
      </ChakraProvider>
      {/* Add ToastContainer outside of ChakraProvider to prevent the warning */}
      <ToastContainer />
    </>
  );
};

export default App;