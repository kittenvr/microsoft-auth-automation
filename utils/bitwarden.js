const { execSync } = require('child_process');

// Create directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const dir = path.dirname(__filename);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

/**
 * Setup Bitwarden server configuration
 */
function setupBitwarden() {
  const bwServer = process.env.BW_SERVER || 'https://vault.bitwarden.com'; // Allow custom server

  // Configure server if it's different from default
  if (bwServer !== 'https://vault.bitwarden.com') {
    // Logout before changing server configuration
    try {
      execSync('npx bw logout', { stdio: 'pipe' });
    } catch (logoutErr) {
      // Ignore logout errors if not logged in
    }
    execSync(`npx bw config server ${bwServer}`, { stdio: 'pipe' });
  } else {
    // If using default server, make sure we're using the right server
    try {
      const currentServer = execSync('npx bw config', { encoding: 'utf8' });
      if (!currentServer.includes('vault.bitwarden.com')) {
        execSync('npx bw logout', { stdio: 'pipe' });
      }
    } catch (configErr) {
      // If config command fails, continue with login
    }
  }
}

/**
 * Login to Bitwarden and get session token
 */
function getBitwardenSession() {
  const bwEmail = process.env.BW_EMAIL;
  const bwPassword = process.env.BW_PASSWORD;

  if (!bwEmail || !bwPassword) {
    throw new Error('BW_EMAIL and BW_PASSWORD environment variables must be set');
  }

  // Setup the server first
  setupBitwarden();

  try {
    // Try to login with email and password
    execSync(`echo "${bwPassword}" | npx bw login ${bwEmail} --passwordenv BW_PASSWORD`, { stdio: 'pipe', encoding: 'utf8' });
    
    // Get the session token
    const sessionToken = execSync('npx bw unlock --passwordenv BW_PASSWORD --raw', { encoding: 'utf8' }).trim();
    
    return sessionToken;
  } catch (error) {
    throw new Error(`Failed to login to Bitwarden: ${error.message}`);
  }
}

/**
 * Get credentials from Bitwarden with user selection
 */
async function getCredentialsWithSelection(searchTerms = ['microsoft']) {
  // Get or create session token
  let sessionKey = process.env.BW_SESSION;
  
  if (!sessionKey) {
    sessionKey = getBitwardenSession();
  }

  // Ensure user is logged in to Bitwarden with the session
  execSync(`npx bw status --session="${sessionKey}"`, { stdio: 'pipe' });

  // Fetch login credentials - search with provided terms
  let items = [];
  for (const term of searchTerms) {
    try {
      const itemsJson = execSync(`npx bw list items --search "${term}" --session="${sessionKey}"`, { encoding: 'utf8' });
      const foundItems = JSON.parse(itemsJson);
      items = items.concat(foundItems);
    } catch (e) {
      // If search fails for this term, continue to next
      continue;
    }
  }
  
  if (items.length === 0) {
    throw new Error(`No matching login item found in Bitwarden vault for: ${searchTerms.join(', ')}`);
  }
  
  // Remove duplicates based on id
  const uniqueItems = items.filter((item, index, self) => 
    index === self.findIndex(t => t.id === item.id)
  );
  
  if (uniqueItems.length === 0) {
    throw new Error(`No unique matching login item found in Bitwarden vault for: ${searchTerms.join(', ')}`);
  }
  
  // If there are multiple items, prompt user to select one
  let loginItem;
  if (uniqueItems.length > 1) {
    console.log(`Found ${uniqueItems.length} accounts:`);
    uniqueItems.forEach((item, index) => {
      console.log(`${index + 1}. Name: ${item.name}, Email: ${item.login.username || 'N/A'}`);
    });
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      rl.question('Select account (enter number): ', (input) => {
        const selection = parseInt(input);
        if (isNaN(selection) || selection < 1 || selection > uniqueItems.length) {
          console.error('Invalid selection. Please enter a number between 1 and', uniqueItems.length);
          process.exit(1);
        }
        resolve(selection - 1);  // Convert to 0-based index
        rl.close();
      });
    });
    
    loginItem = uniqueItems[answer];
  } else {
    loginItem = uniqueItems[0];
    console.log(`Using account: ${loginItem.name} (${loginItem.login.username || 'N/A'})`);
  }

  return {
    email: loginItem.login.username,
    password: loginItem.login.password,
    sessionKey: sessionKey,
    item: loginItem
  };
}

module.exports = {
  getCredentialsWithSelection,
  getBitwardenSession
};