// Script to validate badge URLs and demonstrate the difference
const https = require('https');

// Old badge URL format (using shields.io)
const oldBadgeUrl = 'https://img.shields.io/github/actions/workflow/status/jsbattig/share-things/share-things-ci-cd.yml?label=Lint';

// New badge URL format (with job parameter)
const newBadgeUrl = 'https://github.com/jsbattig/share-things/actions/workflows/share-things-ci-cd.yml/badge.svg?branch=master&event=push&job=lint';

// Function to fetch badge status
function fetchBadgeStatus(url, label) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log(`\n${label} Badge URL: ${url}`);
        console.log(`Status Code: ${res.statusCode}`);
        
        // For SVG responses, check if it contains "failing" or "passing"
        if (data.includes('failing')) {
          console.log('Badge Status: FAILING');
        } else if (data.includes('passing')) {
          console.log('Badge Status: PASSING');
        } else {
          console.log('Badge Status: UNKNOWN');
        }
        
        resolve(data);
      });
    }).on('error', (err) => {
      console.error(`Error fetching ${label} badge: ${err.message}`);
      reject(err);
    });
  });
}

// Main function to compare badges
async function compareBadges() {
  console.log('=== Badge URL Comparison ===');
  console.log('This script demonstrates the difference between the old and new badge URL formats');
  
  try {
    // Fetch old badge format
    await fetchBadgeStatus(oldBadgeUrl, 'OLD');
    
    // Fetch new badge format
    await fetchBadgeStatus(newBadgeUrl, 'NEW');
    
    console.log('\n=== Explanation ===');
    console.log('The old badge format shows the overall workflow status for all jobs.');
    console.log('The new badge format with the job parameter shows the status of a specific job.');
    console.log('\nThis is why all badges were showing the same status before the fix.');
    console.log('With the job parameter, each badge will now show its corresponding job status.');
  } catch (error) {
    console.error('Error comparing badges:', error);
  }
}

// Run the comparison
compareBadges();