/**
 * Refactored Content List Component
 * Shows both progress items and rendered content
 */

import React from 'react';
import { useRefactoredContentStore } from '../../contexts/RefactoredContentStore';
import { ContentStatus } from '../../contexts/ContentStoreTypes';
import ContentProgressItem from './ContentProgressItem';
import ContentItem from './ContentItem';

interface RefactoredContentListProps {
  className?: string;
}

export const RefactoredContentList: React.FC<RefactoredContentListProps> = ({ 
  className = '' 
}) => {
  const { cacheState, operations } = useRefactoredContentStore();

  // Get all progress items (in-progress content)
  const progressItems = Array.from(cacheState.contentProgress.values())
    .filter(progress => progress.status !== ContentStatus.RENDERED)
    .sort((a, b) => b.lastUpdated - a.lastUpdated);

  // Get all rendered content
  const renderedItems = Array.from(cacheState.renderedContent.values())
    .sort((a, b) => b.renderedAt - a.renderedAt);

  const hasProgressItems = progressItems.length > 0;
  const hasRenderedItems = renderedItems.length > 0;
  const hasAnyContent = hasProgressItems || hasRenderedItems;

  if (!hasAnyContent) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <div className="text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No content shared yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Share some content to see it appear here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Progress Section */}
      {hasProgressItems && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-900">
              Receiving Content ({progressItems.length})
            </h3>
            <div className="flex items-center space-x-1 text-xs text-gray-500">
              <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
              <span>Live updates</span>
            </div>
          </div>
          <div className="space-y-3">
            {progressItems.map(progress => (
              <ContentProgressItem
                key={progress.contentId}
                progress={progress}
              />
            ))}
          </div>
        </div>
      )}

      {/* Rendered Content Section */}
      {hasRenderedItems && (
        <div>
          {hasProgressItems && (
            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Shared Content ({renderedItems.length})
              </h3>
            </div>
          )}
          <div className="space-y-4">
            {renderedItems.map(rendered => (
              <ContentItem
                key={rendered.contentId}
                contentId={rendered.contentId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Statistics Footer */}
      <div className="mt-8 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center space-x-4">
            <span>
              {cacheState.stats.totalRenderedEntries} items shared
            </span>
            {cacheState.stats.totalProgressEntries > 0 && (
              <span>
                {cacheState.stats.totalProgressEntries} receiving
              </span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <span>
              Memory: {cacheState.stats.totalMetadataEntries + cacheState.stats.totalChunkEntries} cached items
            </span>
            <button
              onClick={() => operations.clearAllMemoryCache()}
              className="text-blue-600 hover:text-blue-800 underline"
              title="Clear memory cache"
            >
              Clear Cache
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RefactoredContentList;