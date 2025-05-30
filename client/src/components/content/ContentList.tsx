/* eslint-disable react/display-name, react/prop-types */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  HStack,
  Icon,
  Divider,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useToast,
  Spinner
} from '@chakra-ui/react';
import {
  FaSortAmountDown,
  FaSortAmountUp,
  FaEllipsisV,
  FaTrash,
  FaFileAlt
} from 'react-icons/fa';
import { useContentStore } from '../../contexts/ContentStoreContext';
import ContentItem from './ContentItem';

/**
 * Content list component
 */
const ContentList: React.FC = React.memo(() => {
  // State
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Context
  const { getContentList, paginationInfo, loadMoreContent } = useContentStore();
  
  // Toast
  const toast = useToast();
  
  // Get content list
  const contentList = getContentList();
  
  // Sort content list - memoized for performance
  const sortedContentList = useMemo(() => {
    return [...contentList].sort((a, b) => {
      if (sortOrder === 'asc') {
        return a.timestamp - b.timestamp;
      } else {
        return b.timestamp - a.timestamp;
      }
    });
  }, [contentList, sortOrder]);
  
  /**
   * Toggles sort order - memoized callback
   */
  const toggleSortOrder = useCallback(() => {
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  }, [sortOrder]);
  
  /**
   * Clears all content - memoized callback
   */
  const clearAllContent = useCallback(() => {
    // Show loading state while clearing content
    setIsLoading(true);
    
    // This would typically clear all content
    toast({
      title: 'Not implemented',
      description: 'Clear all content functionality is not implemented yet',
      status: 'info',
      duration: 3000,
      isClosable: true
    });
    
    // Reset loading state
    setIsLoading(false);
  }, [toast]);

  /**
   * Handle load more with loading state
   */
  const handleLoadMore = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadMoreContent();
    } catch (error) {
      console.error('Error loading more content:', error);
      toast({
        title: 'Error loading more content',
        description: 'Please try again',
        status: 'error',
        duration: 3000,
        isClosable: true,
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadMoreContent, toast]);
  
  // Show loading state
  if (isLoading) {
    return (
      <Flex justify="center" align="center" h="100%" minH="300px">
        <Spinner size="xl" color="blue.500" thickness="4px" />
      </Flex>
    );
  }
  
  // Show empty state
  if (contentList.length === 0) {
    return (
      <Flex 
        direction="column" 
        justify="center" 
        align="center" 
        h="100%" 
        minH="300px"
        p={8}
        textAlign="center"
      >
        <Icon as={FaFileAlt} boxSize={12} color="gray.300" mb={4} />
        <Heading as="h3" size="md" mb={2}>No content shared yet</Heading>
        <Text color="gray.500" maxW="md">
          Shared content will appear here. Use the panel on the right to share content.
        </Text>
      </Flex>
    );
  }
  
  return (
    <Box>
      <Flex justify="space-between" align="center" mb={4}>
        <Heading as="h2" size="md">
          Shared Content ({contentList.length})
        </Heading>
        
        <HStack spacing={2}>
          <Button
            size="sm"
            leftIcon={<Icon as={sortOrder === 'asc' ? FaSortAmountUp : FaSortAmountDown} />}
            variant="ghost"
            onClick={toggleSortOrder}
          >
            {sortOrder === 'asc' ? 'Oldest first' : 'Newest first'}
          </Button>
          
          <Menu>
            <MenuButton as={Button} size="sm" variant="ghost">
              <Icon as={FaEllipsisV} />
            </MenuButton>
            <MenuList>
              <MenuItem icon={<Icon as={FaTrash} />} onClick={clearAllContent}>
                Clear all content
              </MenuItem>
            </MenuList>
          </Menu>
        </HStack>
      </Flex>
      
      <Divider mb={4} />
      
      <VStack spacing={4} align="stretch">
        {sortedContentList.map((content) => (
          <ContentItem key={content.contentId} contentId={content.contentId} />
        ))}
      </VStack>

      {/* Pagination Controls */}
      {paginationInfo && (
        <Box mt={6} textAlign="center">
          <Text fontSize="sm" color="gray.600" mb={3}>
            Showing {contentList.length} of {paginationInfo.totalCount} items
          </Text>
          
          {paginationInfo.hasMore && (
            <Button
              onClick={handleLoadMore}
              isLoading={isLoading}
              loadingText="Loading more..."
              colorScheme="blue"
              variant="outline"
              size="sm"
            >
              Load More ({paginationInfo.totalCount - contentList.length} remaining)
            </Button>
          )}
          
          {!paginationInfo.hasMore && paginationInfo.totalCount > paginationInfo.pageSize && (
            <Text fontSize="sm" color="gray.500">
              All content loaded
            </Text>
          )}
        </Box>
      )}
    </Box>
  );
});

export default ContentList;