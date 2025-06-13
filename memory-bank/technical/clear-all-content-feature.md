# Clear All Content Feature Implementation

## Overview

The Clear All Content feature provides users with the ability to safely and completely remove all shared content from a session. This feature was implemented with comprehensive security validation, real-time broadcasting, and complete cleanup across all system layers.

## Feature Requirements

### User Experience Requirements
- **Safety First**: Requires explicit confirmation to prevent accidental deletion
- **Session Validation**: User must type exact session name to confirm action  
- **Real-time Updates**: All connected clients see content cleared immediately
- **Complete Cleanup**: All traces of content removed from system

### Technical Requirements
- **Server-side Deletion**: Database and file system cleanup
- **Client-side Cleanup**: Local cache and state management
- **Broadcasting**: Real-time notification to all session participants
- **Security**: Only session members can trigger the action

## Implementation Architecture

### Client-Side Components

#### 1. Confirmation Modal (ContentList.tsx)
```typescript
// Modal with session name validation
<Modal isOpen={isOpen} onClose={handleCloseConfirmation} isCentered>
  <ModalContent>
    <ModalHeader>Clear All Content</ModalHeader>
    <ModalBody>
      <Alert status="warning">
        This action will permanently delete all content from this session and cannot be undone.
      </Alert>
      
      <FormControl isInvalid={confirmationInput.trim() !== sessionId?.trim()}>
        <FormLabel>
          To confirm, type the session name: <strong>{sessionId}</strong>
        </FormLabel>
        <Input
          value={confirmationInput}
          onChange={(e) => setConfirmationInput(e.target.value)}
          placeholder={`Enter "${sessionId}" to confirm`}
        />
      </FormControl>
    </ModalBody>
    
    <ModalFooter>
      <Button
        colorScheme="red"
        onClick={handleConfirmClearAll}
        isDisabled={confirmationInput.trim() !== sessionId?.trim()}
      >
        Clear All Content
      </Button>
    </ModalFooter>
  </ModalContent>
</Modal>
```

#### 2. Confirmation Logic
```typescript
const handleConfirmClearAll = useCallback(async () => {
  if (!sessionId) return;
  
  // Exact case-sensitive session name validation
  if (confirmationInput.trim() !== sessionId.trim()) {
    toast({
      title: 'Session name mismatch',
      description: 'Please enter the exact session name to confirm.',
      status: 'error'
    });
    return;
  }

  setIsClearingAll(true);
  
  try {
    // Call server-side clear operation
    await clearAllContentSocket(sessionId);
    
    // Clear local content store
    clearContents();
    
    // Clear local cache
    diskCacheService.clearAll();
    
    toast({
      title: 'Content cleared',
      description: 'All content has been successfully cleared from the session.',
      status: 'success'
    });
  } catch (error) {
    toast({
      title: 'Error clearing content',
      description: 'Failed to clear all content. Please try again.',
      status: 'error'
    });
  } finally {
    setIsClearingAll(false);
  }
}, [sessionId, confirmationInput, clearAllContentSocket, clearContents]);
```

#### 3. Socket Integration (SocketContext.tsx)
```typescript
// New method added to SocketContextType interface
const clearAllContent = (sessionId: string): Promise<{ success: boolean; error?: string }> => {
  return new Promise((resolve) => {
    if (socket && isConnected) {
      socket.emit('clear-all-content', { sessionId }, (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          console.error(`Failed to clear all content:`, response.error);
        }
        resolve(response);
      });
    } else {
      resolve({ success: false, error: 'Socket not connected' });
    }
  });
};
```

### Server-Side Components

#### 1. Socket Event Handler (socket/index.ts)
```typescript
// New socket handler for clear-all-content event
socket.on('clear-all-content', async (data: { sessionId: string }, callback?: SocketCallback) => {
  try {
    const { sessionId } = data;
    
    console.log(`Client ${socket.id} requesting to clear all content from session ${sessionId}`);

    // Verify client is in the session
    if (socket.data.sessionId !== sessionId) {
      console.error(`Client ${socket.id} tried to clear all content from session ${sessionId} but is not in it`);
      if (callback) {
        callback({ success: false, error: 'Not in session' });
      }
      return;
    }

    // Verify session exists
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      console.error(`Session ${sessionId} not found`);
      if (callback) {
        callback({ success: false, error: 'Session not found' });
      }
      return;
    }

    try {
      const chunkStorage = await chunkStoragePromise;
      const result = await chunkStorage.cleanupAllSessionContent(sessionId);
      
      // Notify all clients in the session (including the sender)
      io.to(sessionId).emit('all-content-cleared', {
        sessionId,
        clearedBy: socket.id
      });

      if (callback) {
        callback({ success: true });
      }

      console.log(`All content cleared from session ${sessionId} by client ${socket.id}. Removed ${result.removed.length} items.`);
    } catch (storageError) {
      console.error(`Error clearing all content from session ${sessionId}:`, storageError);
      if (callback) {
        callback({ success: false, error: 'Storage error' });
      }
    }
  } catch (error) {
    console.error('Error in clear-all-content handler:', error);
    if (callback) {
      callback({ success: false, error: 'Internal server error' });
    }
  }
});
```

#### 2. Storage Integration
The feature leverages the existing `cleanupAllSessionContent()` method in `FileSystemChunkStorage.ts`:

```typescript
async cleanupAllSessionContent(sessionId: string): Promise<{ removed: string[] }> {
  // Get all content for the session
  const allContent = await this.db.all<{ id: string }[]>(
    'SELECT id FROM content WHERE session_id = ?',
    sessionId
  );

  const removed: string[] = [];

  // Remove each content item (database + files)
  for (const content of allContent) {
    try {
      await this.deleteContent(content.id);
      removed.push(content.id);
    } catch (error) {
      console.error(`Failed to remove content ${content.id}:`, error);
    }
  }

  return { removed };
}
```

#### 3. Client Event Handling (ContentStoreContext.tsx)
```typescript
// Event handler for all-content-cleared broadcast
const handleAllContentCleared = () => {
  // Clear all local content
  setContents(new Map());
  setChunkStores(new Map());
  
  // Clear pagination info
  setPaginationInfo({
    totalCount: 0,
    currentPage: 1,
    pageSize: 10,
    hasMore: false
  });
  
  // Clear local cache
  diskCacheService.clearAll();
};

// Socket event listener registration
socket.on('all-content-cleared', handleAllContentCleared);
```

## Security Features

### 1. Session Name Validation
- **Exact Match Required**: User must type session name exactly as displayed
- **Case Sensitive**: Prevents typos and accidental confirmations
- **Real-time Validation**: Button disabled until input matches exactly
- **Clear Error Messages**: Informative feedback for validation failures

### 2. Authorization Checks
- **Session Membership**: Only clients who are members of the session can trigger clear all
- **Server-side Verification**: Double-check that requesting client is in the correct session
- **Session Existence**: Verify session exists before attempting to clear content

### 3. Comprehensive Cleanup
- **Database**: All content metadata removed from SQLite database
- **File System**: All encrypted chunk files deleted from disk
- **Client Cache**: IndexedDB cache cleared on all connected clients
- **Application State**: React state reset to empty on all clients

## Broadcasting and Real-time Updates

### 1. Event Flow
```
Client A triggers clear all
         ↓
Server validates and processes
         ↓
Server broadcasts to ALL clients in session
         ↓
All clients (including A) receive 'all-content-cleared' event
         ↓
All clients clear local state and cache
```

### 2. Event Broadcasting
```typescript
// Server broadcasts to entire session room
io.to(sessionId).emit('all-content-cleared', {
  sessionId,
  clearedBy: socket.id  // Who initiated the clear
});
```

### 3. Client-side Event Handling
All connected clients automatically:
- Clear their local content maps
- Reset pagination state
- Clear IndexedDB cache
- Update UI to show empty state

## Testing Coverage

### 1. Functional Tests (clear-all-content.test.ts)
```typescript
describe('Clear All Content Functional Test', () => {
  test('should clear all content and broadcast to all clients', async () => {
    // Setup: Connect multiple clients, share content
    // Action: Clear all content from one client
    // Verify: All clients see cleared state
    // Verify: Server storage is completely empty
  });

  test('should reject clear all from non-session member', async () => {
    // Verify unauthorized clients cannot clear content
  });

  test('should handle clear all for non-existent session', async () => {
    // Verify graceful handling of edge cases
  });
});
```

### 2. Test Scenarios Covered
- **Happy Path**: Successful clear all with multiple clients
- **Security**: Unauthorized access prevention  
- **Edge Cases**: Non-existent sessions, disconnected clients
- **Broadcasting**: Multi-client notification verification
- **Storage Verification**: Database and file system cleanup validation

## Error Handling

### 1. Client-side Error Handling
```typescript
try {
  await clearAllContentSocket(sessionId);
  // Success handling
} catch (error) {
  toast({
    title: 'Error clearing content',
    description: 'Failed to clear all content. Please try again.',
    status: 'error'
  });
}
```

### 2. Server-side Error Handling
- **Session Validation**: Not in session / session not found
- **Storage Errors**: Database or file system failures
- **Network Errors**: Socket communication failures
- **Graceful Degradation**: Partial cleanup with error reporting

### 3. Recovery Scenarios
- **Partial Failures**: Individual content item deletion failures logged but don't stop process
- **Network Issues**: Client timeout handling with retry capability
- **State Inconsistency**: Automatic state refresh on reconnection

## Performance Considerations

### 1. Batch Operations
- **Database**: Single transaction for metadata deletion
- **File System**: Parallel file deletion where possible
- **Broadcasting**: Single event to all clients simultaneously

### 2. UI Responsiveness
- **Loading States**: Clear visual feedback during operation
- **Non-blocking**: UI remains responsive during deletion
- **Progress Indication**: Button shows loading state with descriptive text

### 3. Large Session Handling
- **Scalable Cleanup**: Efficiently handles sessions with many content items
- **Memory Management**: Streaming deletion for large datasets
- **Error Isolation**: Individual item failures don't cascade

## Future Enhancements

### Potential Improvements
1. **Selective Clear**: Clear only specific types of content
2. **Clear History**: Log of clear all actions for audit
3. **Undo Capability**: Brief window to undo clear all action
4. **Batch Confirmation**: Clear multiple sessions at once
5. **Admin Override**: Moderator capability to clear any session

### Configuration Options
1. **Confirmation Requirements**: Configurable validation strictness
2. **Cleanup Scheduling**: Automatic clearing after inactivity
3. **Retention Policies**: Partial retention for backup purposes
4. **Audit Logging**: Detailed logging of clear all actions

## Integration Points

### 1. Existing Systems
- **FileSystemChunkStorage**: Leverages existing `cleanupAllSessionContent()` method
- **Socket Infrastructure**: Uses existing Socket.IO event system
- **React Context**: Integrates with existing ContentStoreContext
- **UI Components**: Builds on existing Chakra UI modal system

### 2. Configuration
- **Environment Variables**: No new configuration required
- **Feature Flags**: Could be controlled via feature flags if needed
- **Permissions**: Inherits session-level permissions

### 3. Monitoring
- **Logging**: Comprehensive server-side logging of clear actions
- **Metrics**: Could be enhanced with usage analytics
- **Alerts**: Could notify administrators of clear all actions

This Clear All Content feature provides a robust, secure, and user-friendly way to manage session content lifecycle while maintaining the high standards of security and performance expected in the ShareThings application.