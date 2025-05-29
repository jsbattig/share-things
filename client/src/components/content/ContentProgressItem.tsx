/**
 * Content Progress Item Component
 * Shows real-time progress as chunks arrive
 */

import React from 'react';
import { ContentProgress, ContentStatus } from '../../contexts/ContentStoreTypes';

interface ContentProgressItemProps {
  progress: ContentProgress;
  className?: string;
}

export const ContentProgressItem: React.FC<ContentProgressItemProps> = ({ 
  progress, 
  className = '' 
}) => {
  const getStatusColor = (status: ContentStatus): string => {
    switch (status) {
      case ContentStatus.RECEIVING:
        return 'bg-blue-500';
      case ContentStatus.READY_TO_RENDER:
        return 'bg-yellow-500';
      case ContentStatus.RENDERING:
        return 'bg-purple-500';
      case ContentStatus.RENDERED:
        return 'bg-green-500';
      case ContentStatus.ERROR:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = (status: ContentStatus): string => {
    switch (status) {
      case ContentStatus.RECEIVING:
        return 'Receiving chunks...';
      case ContentStatus.READY_TO_RENDER:
        return 'Ready to render';
      case ContentStatus.RENDERING:
        return 'Rendering content...';
      case ContentStatus.RENDERED:
        return 'Complete';
      case ContentStatus.ERROR:
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  const fileName = progress.metadata?.metadata.metadata.fileName || 'Unknown Content';
  const fileSize = progress.metadata?.metadata.metadata.size;
  const mimeType = progress.metadata?.metadata.metadata.mimeType;

  return (
    <div className={`bg-white rounded-lg shadow-md p-4 border-l-4 ${getStatusColor(progress.status)} ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900 truncate">
            {fileName}
          </h3>
          <div className="flex items-center space-x-2 text-xs text-gray-500">
            {fileSize && (
              <span>{(fileSize / 1024).toFixed(1)} KB</span>
            )}
            {mimeType && (
              <span>• {mimeType}</span>
            )}
          </div>
        </div>
        <div className="ml-2 flex-shrink-0">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${getStatusColor(progress.status)}`}>
            {getStatusText(progress.status)}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>
            {progress.receivedChunks}/{progress.totalChunks || '?'} chunks
          </span>
          <span>{Math.round(progress.progressPercentage)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full transition-all duration-300 ${getStatusColor(progress.status)}`}
            style={{ width: `${Math.min(progress.progressPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Additional Info */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {progress.status === ContentStatus.RECEIVING && progress.totalChunks && (
            `${progress.totalChunks - progress.receivedChunks} chunks remaining`
          )}
          {progress.status === ContentStatus.RENDERED && (
            `Completed ${new Date(progress.lastUpdated).toLocaleTimeString()}`
          )}
          {progress.status === ContentStatus.ERROR && progress.errorMessage && (
            `Error: ${progress.errorMessage}`
          )}
        </span>
        
        {progress.status === ContentStatus.RECEIVING && (
          <div className="flex items-center space-x-1">
            <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>Receiving...</span>
          </div>
        )}
        
        {progress.status === ContentStatus.RENDERING && (
          <div className="flex items-center space-x-1">
            <div className="animate-spin w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full"></div>
            <span>Processing...</span>
          </div>
        )}
      </div>

      {/* Error Details */}
      {progress.status === ContentStatus.ERROR && progress.errorMessage && (
        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <strong>Error:</strong> {progress.errorMessage}
        </div>
      )}
    </div>
  );
};

export default ContentProgressItem;