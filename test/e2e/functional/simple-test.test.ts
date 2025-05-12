import { TestOrchestrator } from './test-orchestrator';

// Simple test that just tests text sharing
test('Text sharing', async () => {
  // Create test orchestrator
  const orchestrator = new TestOrchestrator();
  
  try {
    // Set up test environment
    await orchestrator.setup();
    
    // Run text sharing test
    await orchestrator.testTextSharing();
  } finally {
    // Clean up resources
    await orchestrator.cleanup();
  }
}, 120000); // 2 minute timeout