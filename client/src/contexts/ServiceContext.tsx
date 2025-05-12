import React, { createContext, useContext } from 'react';
import { ChunkTrackingService, chunkTrackingService } from '../services/ChunkTrackingService';
import { UrlRegistry, urlRegistry } from '../services/UrlRegistry';

/**
 * Service context interface
 */
interface ServiceContextType {
  chunkTrackingService: ChunkTrackingService;
  urlRegistry: UrlRegistry;
}

// Create context
const ServiceContext = createContext<ServiceContextType | null>(null);

/**
 * Service provider component
 */
export const ServiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Create context value with singleton instances
  const value: ServiceContextType = {
    chunkTrackingService,
    urlRegistry
  };

  return (
    <ServiceContext.Provider value={value}>
      {children}
    </ServiceContext.Provider>
  );
};

/**
 * Hook to use the service context
 */
export const useServices = (): ServiceContextType => {
  const context = useContext(ServiceContext);
  
  if (!context) {
    throw new Error('useServices must be used within a ServiceProvider');
  }
  
  return context;
};