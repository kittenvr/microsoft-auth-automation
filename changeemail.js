require('dotenv').config();
const { chromium } = require('playwright');
const { getCredentialsWithSelection } = require('./utils/bitwarden');
const { generate } = require('generate-passphrase');

// Main execution
(async () => {
  try {
    // Get Microsoft account credentials from Bitwarden
    const { email: mainEmail, password } = await getCredentialsWithSelection(['microsoft', 'office', 'account']);

    // Get domain from environment variable
    const domain = process.env.DOMAIN || 'yourdomain.com';

    // Generate a random catchall email with two words using generate-passphrase
    const passphrase = generate({ length: 2, separator: '-', titlecase: true }); // e.g., "Minerals-Skin"
    const recoveryEmail = `${passphrase}@${domain}`;

    const browser = await chromium.launch({
      headless: false
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Step 1: Navigate to Microsoft login
    await page.goto('https://login.microsoftonline.com/');

    // Step 2: Enter main email
    await page.getByRole('textbox', { name: 'Enter your email, phone, or' }).fill(mainEmail);
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 3: Enter password
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click().catch(() => {
      // If sign in button doesn't exist, try primary button
      page.getByTestId('primaryButton').click().catch(() => {});
    });

    // Step 4: Handle if recovery email is prompted
    try {
      await page.waitForSelector('input[name="recoveryEmail"], [role="textbox"][name="Email"]', { timeout: 5000 });
      await page.getByRole('textbox', { name: 'Email' }).fill(recoveryEmail);
      await page.getByTestId('primaryButton').click();
    } catch (e) {
      // If no recovery email prompt, continue
      console.log("No recovery email prompt found, continuing...");
    }

    // Step 5: Navigate to stay signed in (use a more generic navigation)
    await page.goto('https://account.microsoft.com/');
    await page.waitForTimeout(2000); // Wait for page to load

    // Step 6: Navigate to security settings
    await page.goto('https://account.microsoft.com/security');
    await page.getByRole('button', { name: 'Manage how I sign in' }).click();
    await page.getByRole('button', { name: 'Add another way to sign in to' }).click();

    // Step 7: Add recovery email
    await page.getByRole('button', { name: 'Email a code Get an email and' }).click();
    await page.getByRole('textbox', { name: 'Alternate email address' }).fill(recoveryEmail);
    await page.getByRole('button', { name: 'Next' }).click();

    // Step 8: Wait for user to enter the code sent to the recovery email
    console.log(`Code has been sent to ${recoveryEmail}. Please enter the code manually in the browser.`);
    console.log('Press Enter when you have entered the code...');
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      rl2.question('', () => {
        rl2.close();
        resolve();
      });
    });

    await page.getByRole('button', { name: 'Next' }).click();

    await context.close();
    await browser.close();
    console.log('Process completed successfully!');
  } catch (error) {
    console.error('Error during execution:', error.message);
    process.exit(1);
  }
})();