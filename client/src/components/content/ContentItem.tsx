import React from 'react';
import {
  Box,
  Flex,
  Text,
  HStack,
  VStack,
  Icon,
  Button,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Badge,
  useToast,
  useClipboard,
  Image
} from '@chakra-ui/react';
import {
  FaEllipsisV,
  FaTrash,
  FaDownload,
  FaCopy,
  FaFile,
  FaFileAlt,
  FaFileImage,
  FaUser,
  FaCheck
} from 'react-icons/fa';
import { useContentStore, ContentType } from '../../contexts/ContentStoreContext';
import { useServices } from '../../contexts/ServiceContext';
import { formatFileSize, formatDate } from '../../utils/formatters';

interface ContentItemProps {
  contentId: string;
}

/**
 * Content item component
 */
const ContentItem: React.FC<ContentItemProps> = ({ contentId }) => {
  // No state needed
  
  // Context
  const { getContent, updateContentLastAccessed, removeContent } = useContentStore();
  const { urlRegistry, chunkTrackingService } = useServices();
  
  // Toast
  const toast = useToast();
  
  // Get content
  const content = getContent(contentId);
  
  // Clipboard
  const { hasCopied, onCopy } = useClipboard(
    content?.data && typeof content.data === 'string' 
      ? content.data 
      : ''
  );
  
  if (!content) {
    return null;
  }
  
  // Get the metadata from the content entry
  const { metadata } = content;
  
  // Debug logging for content structure
  console.log(`[ContentItem] Content ID: ${contentId}, Content Type: ${metadata.contentType}`);
  console.log(`[ContentItem] Content ID: ${contentId}, Timestamp: ${metadata.timestamp}, Type: ${typeof metadata.timestamp}`);
  console.log(`[ContentItem] Content ID: ${contentId}, Size: ${metadata.metadata.size}, Type: ${typeof metadata.metadata.size}`);
  console.log(`[ContentItem] Full content object:`, content);
  console.log(`[ContentItem] Metadata object:`, metadata);
  console.log(`[ContentItem] Image info:`, metadata.metadata.imageInfo);
  
  /**
   * Copies content to clipboard
   */
  const copyContent = async () => {
    if (!content.data) {
      toast({
        title: 'Cannot copy',
        description: 'Content is not available for copying',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }
    
    try {
      // Update last accessed time when content is actually accessed
      updateContentLastAccessed(contentId);
      if (typeof content.data === 'string') {
        // Copy text content
        onCopy();
      } else if (content.data instanceof Blob) {
        // Copy image or file content
        if (metadata.contentType === ContentType.IMAGE) {
          // For images, use the clipboard API
          const clipboardItems = [
            new ClipboardItem({
              [content.data.type]: content.data
            })
          ];
          
          await navigator.clipboard.write(clipboardItems);
        } else {
          // For other file types, create a temporary link and copy the URL
          const url = urlRegistry.createUrl(contentId, content.data);
          await navigator.clipboard.writeText(url);
          
          // Clean up the URL after a delay
          setTimeout(() => urlRegistry.revokeUrl(contentId, url), 5000);
        }
      }
      
      toast({
        title: 'Copied to clipboard',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: 'Copy failed',
        description: 'Failed to copy content to clipboard',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };
  
  /**
   * Downloads content
   */
  const downloadContent = () => {
    if (!content.data) {
      toast({
        title: 'Cannot download',
        description: 'Content is not available for download',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
      return;
    }
    
    try {
      // Update last accessed time when content is actually accessed
      updateContentLastAccessed(contentId);
      // Create download link
      const url = content.data instanceof Blob
        ? urlRegistry.createUrl(contentId, content.data)
        : `data:text/plain;charset=utf-8,${encodeURIComponent(content.data)}`;
      
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.metadata.fileName || `content-${contentId.substring(0, 8)}`;
      document.body.appendChild(a);
      a.click();
      
      // Clean up
      document.body.removeChild(a);
      if (content.data instanceof Blob) {
        urlRegistry.revokeUrl(contentId, url);
      }
      
      toast({
        title: 'Download started',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      console.error('Error downloading content:', error);
      toast({
        title: 'Download failed',
        description: 'Failed to download content',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };
  
  /**
   * Deletes content
   */
  const deleteContent = () => {
    try {
      // Mark content as being deleted in tracking service
      chunkTrackingService.cleanupChunks(contentId);
      
      // Remove content (this will also revoke URLs)
      removeContent(contentId);
      
      toast({
        title: 'Content removed',
        status: 'success',
        duration: 2000,
        isClosable: true
      });
    } catch (error) {
      console.error('Error removing content:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove content',
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };
  
  /**
   * Renders content preview based on type
   */
  const renderContentPreview = () => {
    // For images, try to render even if isComplete is false but we have data
    if (!content.isComplete && !(content.data instanceof Blob && metadata.contentType === ContentType.IMAGE)) {
      return (
        <Flex align="center" justify="center" h="100px" bg="gray.50" borderRadius="md">
          <Text color="gray.500">Loading content...</Text>
        </Flex>
      );
    }
    
    switch (metadata.contentType) {
      case ContentType.TEXT:
        return (
          <Box 
            p={3} 
            bg="gray.50" 
            borderRadius="md" 
            fontSize="sm"
            fontFamily="monospace"
            whiteSpace="pre-wrap"
            overflow="hidden"
            maxH="200px"
            position="relative"
          >
            {content.data && typeof content.data === 'string' 
              ? content.data.length > 500 
                ? content.data.substring(0, 500) + '...'
                : content.data
              : 'No content available'}
            
            {content.data && typeof content.data === 'string' && content.data.length > 500 && (
              <Box 
                position="absolute" 
                bottom={0} 
                left={0} 
                right={0} 
                h="50px"
                bgGradient="linear(to-t, gray.50, transparent)"
              />
            )}
          </Box>
        );
        
      case ContentType.IMAGE:
        console.log(`[ContentItem] Rendering image for ${contentId}, isComplete: ${content.isComplete}`);
        
        return (
          <Box
            borderRadius="md"
            overflow="hidden"
            maxH="200px"
            display="flex"
            justifyContent="center"
            bg="gray.50"
          >
            {content.data instanceof Blob ? (
              <>
                <Image
                  key={`image-${contentId}`} // Removed Date.now() to prevent unnecessary re-renders
                  src={urlRegistry.createUrl(contentId, content.data)}
                  alt={metadata.metadata.fileName || `Image-${contentId.substring(0, 8)}`}
                  maxH="200px"
                  objectFit="contain"
                  onLoad={() => {
                    console.log(`[ContentItem] Image for ${contentId} loaded successfully`);
                    
                    // Force update content as complete if image loads successfully
                    if (!content.isComplete) {
                      console.log(`[ContentItem] Force marking content ${contentId} as complete after successful image load`);
                      updateContentLastAccessed(contentId);
                      
                      // Mark content as displayed in tracking service
                      chunkTrackingService.markContentDisplayed(contentId);
                    }
                  }}
                  onError={(e) => {
                    console.error(`[ContentItem] Error loading image for ${contentId}:`, e);
                  }}
                />
                {!content.isComplete && (
                  <Box
                    position="absolute"
                    top={0}
                    left={0}
                    right={0}
                    bottom={0}
                    bg="blackAlpha.50"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text fontSize="xs" color="gray.600">Finalizing image...</Text>
                  </Box>
                )}
              </>
            ) : (
              <Flex align="center" justify="center" h="100px">
                <Text color="gray.500">Image preview not available</Text>
              </Flex>
            )}
          </Box>
        );
        
      case ContentType.FILE:
        return (
          <Flex 
            align="center" 
            p={4} 
            bg="gray.50" 
            borderRadius="md"
          >
            <Icon 
              as={FaFile} 
              boxSize={10} 
              color="blue.500" 
              mr={4}
            />
            <VStack align="start" spacing={1}>
              <Text fontWeight="medium">
                {metadata.metadata.fileName || `File-${contentId.substring(0, 8)}`}
              </Text>
              <Text fontSize="sm" color="gray.500">
                {formatFileSize(metadata.metadata.size)}
              </Text>
            </VStack>
          </Flex>
        );
        
      default:
        return (
          <Flex align="center" justify="center" h="100px" bg="gray.50" borderRadius="md">
            <Text color="gray.500">Preview not available</Text>
          </Flex>
        );
    }
  };
  
  /**
   * Gets content icon based on type
   */
  const getContentIcon = () => {
    switch (metadata.contentType) {
      case ContentType.TEXT:
        return FaFileAlt;
      case ContentType.IMAGE:
        return FaFileImage;
      case ContentType.FILE:
        return FaFile;
      default:
        return FaFile;
    }
  };
  
  return (
    <Box 
      borderWidth="1px" 
      borderRadius="lg" 
      overflow="hidden"
      bg="white"
      transition="all 0.2s"
      _hover={{ boxShadow: 'md' }}
    >
      <Box p={4}>
        <Flex justify="space-between" align="center" mb={2}>
          <HStack spacing={2}>
            <Icon as={getContentIcon()} color="blue.500" />
            <Text fontWeight="bold">
              {metadata.metadata.fileName ||
                (metadata.contentType === ContentType.TEXT
                  ? 'Text content'
                  : metadata.contentType === ContentType.IMAGE
                    ? `Image-${contentId.substring(0, 8)}`
                    : 'File')}
            </Text>
            {!content.isComplete && (
              <Badge colorScheme="yellow">Loading</Badge>
            )}
          </HStack>
          
          <HStack spacing={1}>
            {/* Copy Button */}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Copy to clipboard"
              title="Copy to clipboard"
              onClick={copyContent}
              isDisabled={!content.isComplete}
            >
              <Icon as={hasCopied ? FaCheck : FaCopy} />
            </Button>
            
            {/* Download Button */}
            <Button
              size="sm"
              variant="ghost"
              aria-label="Download"
              title="Download"
              onClick={downloadContent}
              isDisabled={!content.isComplete}
            >
              <Icon as={FaDownload} />
            </Button>
            
            {/* Menu Button */}
            <Menu>
              <MenuButton as={Button} size="sm" variant="ghost">
                <Icon as={FaEllipsisV} />
              </MenuButton>
              <MenuList>
                <MenuItem
                  icon={<Icon as={hasCopied ? FaCheck : FaCopy} />}
                  onClick={copyContent}
                  isDisabled={!content.isComplete}
                >
                  Copy to clipboard
                </MenuItem>
                <MenuItem
                  icon={<Icon as={FaDownload} />}
                  onClick={downloadContent}
                  isDisabled={!content.isComplete}
                >
                  Download
                </MenuItem>
                <MenuItem icon={<Icon as={FaTrash} />} onClick={deleteContent}>
                  Remove
                </MenuItem>
              </MenuList>
            </Menu>
          </HStack>
        </Flex>
        
        <HStack spacing={2} mb={3} fontSize="sm" color="gray.500">
          <Icon as={FaUser} boxSize={3} />
          <Text>{metadata.senderId === 'me' ? 'You' : metadata.senderName}</Text>
          <Text>•</Text>
          <Text>{formatDate(metadata.timestamp)}</Text>
          <Text>•</Text>
          {/* Display appropriate metadata based on content type */}
          {metadata.contentType === ContentType.TEXT && (
            <Text>{metadata.metadata.size ? `${formatFileSize(metadata.metadata.size)} (${metadata.metadata.size} chars)` : '0 Bytes'}</Text>
          )}
          {metadata.contentType === ContentType.IMAGE && (
            <Text>
              {formatFileSize(metadata.metadata.size)}
              {metadata.metadata.imageInfo?.width && metadata.metadata.imageInfo?.height &&
                ` • ${metadata.metadata.imageInfo.width}×${metadata.metadata.imageInfo.height}`}
              {metadata.metadata.imageInfo?.format && ` • ${metadata.metadata.imageInfo.format}`}
            </Text>
          )}
          {metadata.contentType === ContentType.FILE && (
            <Text>{formatFileSize(metadata.metadata.size)}</Text>
          )}
          {metadata.contentType === ContentType.OTHER && (
            <Text>{formatFileSize(metadata.metadata.size)}</Text>
          )}
          {/* Fallback for when content type is not recognized or metadata is missing */}
          {(!metadata.contentType ||
            (metadata.contentType !== ContentType.TEXT &&
             metadata.contentType !== ContentType.IMAGE &&
             metadata.contentType !== ContentType.FILE &&
             metadata.contentType !== ContentType.OTHER)) && (
            <Text>{formatFileSize(metadata.metadata.size)}</Text>
          )}
        </HStack>
        
        {renderContentPreview()}
      </Box>
    </Box>
  );
};

export default ContentItem;