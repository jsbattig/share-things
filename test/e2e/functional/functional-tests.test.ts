import { TestOrchestrator } from './test-orchestrator';

describe('ShareThings Functional Tests', () => {
  // Run only one test at a time to avoid timeouts
  // Comment out the tests you don't want to run
  
  // Text sharing test
  describe('Text sharing', () => {
    let orchestrator: TestOrchestrator;
    
    beforeAll(async () => {
      orchestrator = new TestOrchestrator();
      await orchestrator.setup();
    });
    
    afterAll(async () => {
      await orchestrator.cleanup();
    });
    
    test('should share text between clients', async () => {
      await orchestrator.testTextSharing();
    }, 60000); // 60 second timeout
  });
  
  // Uncomment to run this test
  /*
  describe('Image sharing', () => {
    let orchestrator: TestOrchestrator;
    
    beforeAll(async () => {
      orchestrator = new TestOrchestrator();
      await orchestrator.setup();
    });
    
    afterAll(async () => {
      await orchestrator.cleanup();
    });
    
    test('should share images between clients', async () => {
      await orchestrator.testImageSharing();
    }, 30000); // 30 second timeout
  });
  */
  
  // Uncomment to run this test
  /*
  describe('File sharing', () => {
    let orchestrator: TestOrchestrator;
    
    beforeAll(async () => {
      orchestrator = new TestOrchestrator();
      await orchestrator.setup();
    });
    
    afterAll(async () => {
      await orchestrator.cleanup();
    });
    
    test('should share files between clients', async () => {
      await orchestrator.testFileSharing();
    }, 30000); // 30 second timeout
  });
  */
});