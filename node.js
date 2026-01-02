require('dotenv').config();
const { chromium } = require('playwright');
const { getCredentialsWithSelection } = require('./utils/bitwarden');

// Get code from command line argument
const code = process.argv[2];
if (!code) {
  console.error('Please provide the code as an argument: node node.js <CODE>');
  process.exit(1);
}

// Main execution
(async () => {
  try {
    // Get Microsoft account credentials from Bitwarden
    const { email, password } = await getCredentialsWithSelection(['login.live.com', 'microsoft']);

    const browser = await chromium.launch({
      headless: false
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://login.live.com/oauth20_remoteconnect.srf');
    await page.getByRole('textbox', { name: 'Enter code' }).click();
    await page.getByRole('textbox', { name: 'Enter code' }).fill(code);
    await page.getByRole('button', { name: 'Allow access' }).click();
    await page.getByRole('textbox', { name: 'Email or phone number' }).fill(email);
    await page.getByTestId('primaryButton').click();
    await page.getByRole('button', { name: 'Use your password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByTestId('primaryButton').click();
    await page.getByTestId('primaryButton').click();

    await context.close();
    await browser.close();
  } catch (error) {
    console.error('Error retrieving credentials from Bitwarden:', error.message);
    process.exit(1);
  }
})();
