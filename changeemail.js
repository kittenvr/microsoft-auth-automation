require('dotenv-safe').config();
const { chromium } = require('playwright');
const { addExtra } = require('playwright-extra');
const stealth = require('playwright-extra/dist/plugins/stealth/index.cjs');

// Add stealth plugin to reduce detection
const enhancedChromium = addExtra(chromium);
enhancedChromium.use(stealth());
const { getCredentialsWithSelection } = require('./utils/bitwarden');
const { generate } = require('generate-passphrase');
const { EmailAutomation, DualEmailMonitor } = require('./utils/emailAutomation');

// Main execution
(async () => {
  try {
    // Get Microsoft account credentials from Bitwarden
    const { email: mainEmail, password } = await getCredentialsWithSelection(['microsoft', 'office', 'account']);

    // Get domain from environment variable
    const domain = process.env.RECOVERY_DOMAIN || 'yourdomain.com';

    // Generate a random catchall email with two words using generate-passphrase
    const passphrase = generate({ length: 2, separator: '-', titlecase: true }); // e.g., "Minerals-Skin"
    const recoveryEmail = `${passphrase}@${domain}`;

    const browser = await enhancedChromium.launch({
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

    // Step 5: Navigate to account security settings
    await page.goto('https://account.microsoft.com/security');
    await page.waitForTimeout(2000); // Wait for page to load

    // Step 6: Navigate to security settings
    await page.getByRole('button', { name: 'Manage how I sign in' }).click();
    await page.getByRole('button', { name: 'Add another way to sign in to' }).click();

    // Step 7: Add recovery email
    await page.getByRole('button', { name: 'Email a code Get an email and' }).click();
    await page.getByRole('textbox', { name: 'Alternate email address' }).fill(recoveryEmail);
    await page.getByRole('button', { name: 'Next' }).click();

    console.log(`Recovery email ${recoveryEmail} added. Waiting for verification code...`);

    // Determine email monitoring strategy
    if ((process.env.GMAIL_EMAIL && process.env.GMAIL_PASSWORD) &&
        (process.env.MAILCOW_EMAIL && process.env.MAILCOW_PASSWORD)) {
      // Use dual monitoring if both are configured
      console.log("Using dual email monitoring (Gmail and self-hosted email server)");
      const dualMonitor = new DualEmailMonitor();
      await dualMonitor.connect();
      const verificationCode = await dualMonitor.checkForVerificationCode();
      await page.getByRole('textbox', { name: 'Enter the code' }).fill(verificationCode);
      await page.getByRole('button', { name: 'Next' }).click();
      console.log('Recovery email added successfully with automatic verification from either Gmail or self-hosted email server!');
      dualMonitor.close();
    } else if (process.env.GMAIL_EMAIL && process.env.GMAIL_PASSWORD) {
      // Use Gmail only
      console.log("Using Gmail to monitor for verification codes");
      const imapConfig = {
        user: process.env.GMAIL_EMAIL,
        password: process.env.GMAIL_PASSWORD,
        host: process.env.GMAIL_HOST || 'imap.gmail.com',
        port: process.env.GMAIL_PORT || 993,
        tls: true
      };
      const emailAutomation = new EmailAutomation(imapConfig);
      await emailAutomation.connect();
      const verificationCode = await emailAutomation.checkForVerificationCode();
      await page.getByRole('textbox', { name: 'Enter the code' }).fill(verificationCode);
      await page.getByRole('button', { name: 'Next' }).click();
      console.log('Recovery email added successfully with automatic verification via Gmail!');
      emailAutomation.close();
    } else if (process.env.MAILCOW_EMAIL && process.env.MAILCOW_PASSWORD) {
      // Use self-hosted email server only
      console.log("Using self-hosted email server to monitor for verification codes");
      const imapConfig = {
        user: process.env.MAILCOW_EMAIL,
        password: process.env.MAILCOW_PASSWORD,
        host: process.env.MAILCOW_HOST || 'mail.yourdomain.com',
        port: process.env.MAILCOW_PORT || 993,
        tls: true
      };
      const emailAutomation = new EmailAutomation(imapConfig);
      await emailAutomation.connect();
      const verificationCode = await emailAutomation.checkForVerificationCode();
      await page.getByRole('textbox', { name: 'Enter the code' }).fill(verificationCode);
      await page.getByRole('button', { name: 'Next' }).click();
      console.log('Recovery email added successfully with automatic verification via self-hosted email server!');
      emailAutomation.close();
    } else {
      throw new Error("No email configuration found. Please set up either GMAIL_* or MAILCOW_* environment variables in your .env file.");
    }

    await context.close();
    await browser.close();
    console.log('Process completed successfully!');
  } catch (error) {
    console.error('Error during execution:', error.message);
    process.exit(1);
  }
})();