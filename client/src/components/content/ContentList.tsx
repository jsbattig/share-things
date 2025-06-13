/* eslint-disable react/display-name, react/prop-types */
import React, { useState, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
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
  Spinner,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  useDisclosure,
  Input,
  FormControl,
  FormLabel,
  FormErrorMessage,
  Alert,
  AlertIcon
} from '@chakra-ui/react';
import {
  FaSortAmountDown,
  FaSortAmountUp,
  FaEllipsisV,
  FaTrash,
  FaFileAlt
} from 'react-icons/fa';
import { useContentStore } from '../../contexts/ContentStoreContext';
import { useSocket } from '../../contexts/SocketContext';
import ContentItem from './ContentItem';

/**
 * Content list component
 */
const ContentList: React.FC = React.memo(() => {
  // Get session ID from URL
  const { sessionId } = useParams<{ sessionId: string }>();
  
  // State
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [confirmationInput, setConfirmationInput] = useState<string>('');
  const [isClearingAll, setIsClearingAll] = useState<boolean>(false);
  
  // Modal state
  const { isOpen, onOpen, onClose } = useDisclosure();
  
  // Context
  const { getContentList, paginationInfo, loadMoreContent, clearContents } = useContentStore();
  const { clearAllContent: clearAllContentSocket } = useSocket();
  
  // Toast
  const toast = useToast();
  
  // Get content list
  const contentList = getContentList();
  
  // Sort content list - memoized for performance
  const sortedContentList = useMemo(() => {
    return [...contentList].sort((a, b) => {
      // First, sort by pinned status (pinned items first)
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      
      // Then sort by timestamp within each group (pinned/non-pinned)
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
   * Opens the confirmation dialog for clearing all content
   */
  const clearAllContent = useCallback(() => {
    setConfirmationInput('');
    onOpen();
  }, [onOpen]);

  /**
   * Handles the confirmation and performs the clear all operation
   */
  const handleConfirmClearAll = useCallback(async () => {
    if (!sessionId) return;
    
    // Check if the input matches the session name exactly
    if (confirmationInput.trim() !== sessionId.trim()) {
      toast({
        title: 'Session name mismatch',
        description: 'Please enter the exact session name to confirm.',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }

    setIsClearingAll(true);
    
    try {
      // Call the socket method to clear all content on the server
      // This will also broadcast to all connected clients
      if (clearAllContentSocket) {
        await clearAllContentSocket(sessionId);
      }
      
      // Clear local content store
      clearContents();
      
      toast({
        title: 'Content cleared',
        description: 'All content has been successfully cleared from the session.',
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      
      onClose();
    } catch (error) {
      toast({
        title: 'Error clearing content',
        description: 'Failed to clear all content. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    } finally {
      setIsClearingAll(false);
      setConfirmationInput('');
    }
  }, [sessionId, confirmationInput, clearAllContentSocket, clearContents, toast, onClose]);

  /**
   * Handles closing the confirmation dialog
   */
  const handleCloseConfirmation = useCallback(() => {
    setConfirmationInput('');
    onClose();
  }, [onClose]);

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

      {/* Clear All Content Confirmation Modal */}
      <Modal isOpen={isOpen} onClose={handleCloseConfirmation} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Clear All Content</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            <Alert status="warning" mb={4}>
              <AlertIcon />
              This action will permanently delete all content from this session and cannot be undone.
            </Alert>
            
            <FormControl isInvalid={confirmationInput.trim() !== '' && confirmationInput.trim() !== sessionId?.trim()}>
              <FormLabel>
                To confirm, type the session name: <strong>{sessionId}</strong>
              </FormLabel>
              <Input
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder={`Enter "${sessionId}" to confirm`}
                isDisabled={isClearingAll}
              />
              <FormErrorMessage>
                Session name does not match. Please enter &quot;{sessionId}&quot; exactly.
              </FormErrorMessage>
            </FormControl>
          </ModalBody>

          <ModalFooter>
            <Button
              colorScheme="red"
              mr={3}
              onClick={handleConfirmClearAll}
              isLoading={isClearingAll}
              loadingText="Clearing..."
              isDisabled={confirmationInput.trim() !== sessionId?.trim()}
            >
              Clear All Content
            </Button>
            <Button variant="ghost" onClick={handleCloseConfirmation} isDisabled={isClearingAll}>
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
});

export default ContentList;