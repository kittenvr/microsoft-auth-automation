const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

// Email automation class for handling verification codes using modern imapflow
class EmailAutomation {
  constructor(imapConfig) {
    this.client = new ImapFlow({
      host: imapConfig.host,
      port: imapConfig.port,
      secure: true,
      auth: {
        user: imapConfig.user,
        pass: imapConfig.password
      },
      logger: false // Set to true for debugging
    });
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('Connected to IMAP server using modern imapflow');
      return Promise.resolve();
    } catch (err) {
      console.error('IMAP connection error:', err);
      return Promise.reject(err);
    }
  }

  async checkForVerificationCode(timeoutMs = 60000) {
    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();

      const checkMailbox = async () => {
        try {
          // Search for new emails containing Microsoft verification codes
          const searchResult = await this.client.search({
            unseen: true,
            from: 'account@accountprotection.microsoft.com',
            since: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          });

          if (searchResult.length > 0) {
            // Process emails starting from the most recent
            for (const uid of searchResult.sort((a, b) => b - a)) {
              const message = await this.client.fetchOne(uid, {
                source: true
              });

              if (message.source) {
                const parsed = await simpleParser(message.source);

                // Look for Microsoft verification code in the email
                const verificationCode = this.extractVerificationCode(parsed.text);
                if (verificationCode) {
                  console.log(`Found verification code: ${verificationCode}`);
                  return resolve(verificationCode);
                }
              }
            }
          }

          if (Date.now() - startTime < timeoutMs) {
            setTimeout(checkMailbox, 5000); // Check every 5 seconds
          } else {
            reject(new Error('Timeout waiting for verification code'));
          }
        } catch (error) {
          reject(error);
        }
      };

      await checkMailbox();
    });
  }

  extractVerificationCode(emailText) {
    // Look for 6-digit verification code in Microsoft emails
    const codeRegex = /(\d{6})/g;
    const matches = emailText.match(codeRegex);

    if (matches) {
      // Look for the code in the context of Microsoft verification
      const verificationContext = /verification|code|confirm|security|enter.*below|enter.*next/i;
      if (verificationContext.test(emailText.toLowerCase())) {
        // Return the first 6-digit code found in verification context
        return matches[0];
      }
    }
    return null;
  }

  close() {
    if (this.client) {
      this.client.close();
    }
  }
}

// Dual email monitor for both Gmail and self-hosted email
class DualEmailMonitor {
  constructor() {
    this.gmailAutomation = null;
    this.emailServerAutomation = null;
    this.gmailConnected = false;
    this.emailServerConnected = false;
  }

  async connect() {
    // Try to connect to Gmail if configured
    if (process.env.GMAIL_EMAIL && process.env.GMAIL_PASSWORD) {
      const gmailConfig = {
        user: process.env.GMAIL_EMAIL,
        password: process.env.GMAIL_PASSWORD,
        host: process.env.GMAIL_HOST || 'imap.gmail.com',
        port: process.env.GMAIL_PORT || 993
      };

      try {
        this.gmailAutomation = new EmailAutomation(gmailConfig);
        await this.gmailAutomation.connect();
        this.gmailConnected = true;
        console.log('Connected to Gmail for monitoring');
      } catch (error) {
        console.error('Failed to connect to Gmail:', error.message);
        this.gmailAutomation = null;
      }
    }

    // Try to connect to self-hosted email if configured
    if (process.env.MAILCOW_EMAIL && process.env.MAILCOW_PASSWORD) {
      const emailServerConfig = {
        user: process.env.MAILCOW_EMAIL,
        password: process.env.MAILCOW_PASSWORD,
        host: process.env.MAILCOW_HOST || 'mail.yourdomain.com',
        port: process.env.MAILCOW_PORT || 993
      };

      try {
        this.emailServerAutomation = new EmailAutomation(emailServerConfig);
        await this.emailServerAutomation.connect();
        this.emailServerConnected = true;
        console.log('Connected to self-hosted email server for monitoring');
      } catch (error) {
        console.error('Failed to connect to self-hosted email server:', error.message);
        this.emailServerAutomation = null;
      }
    }

    if (!this.gmailConnected && !this.emailServerConnected) {
      throw new Error("Could not connect to any email service. Please check your environment variables.");
    }
  }

  async checkForVerificationCode(timeoutMs = 60000) {
    return new Promise(async (resolve, reject) => {
      const startTime = Date.now();

      const checkBothAccounts = async () => {
        try {
          // Check both accounts for verification codes
          const checks = [];

          if (this.gmailConnected) {
            checks.push(this.gmailAutomation.checkForVerificationCode(10000) // 10 second timeout for each check
              .catch(() => null)); // Ignore if no code found
          }

          if (this.emailServerConnected) {
            checks.push(this.emailServerAutomation.checkForVerificationCode(10000)
              .catch(() => null)); // Ignore if no code found
          }

          if (checks.length > 0) {
            // Wait for the first promise that resolves with a code
            const results = await Promise.allSettled(checks);
            for (const result of results) {
              if (result.status === 'fulfilled' && result.value) {
                return resolve(result.value);
              }
            }
          }

          if (Date.now() - startTime < timeoutMs) {
            setTimeout(checkBothAccounts, 5000); // Check every 5 seconds
          } else {
            reject(new Error('Timeout waiting for verification code from any email service'));
          }
        } catch (error) {
          if (Date.now() - startTime < timeoutMs) {
            setTimeout(checkBothAccounts, 5000);
          } else {
            reject(new Error('Timeout waiting for verification code from any email service'));
          }
        }
      };

      await checkBothAccounts();
    });
  }

  close() {
    if (this.gmailAutomation) {
      this.gmailAutomation.close();
    }
    if (this.emailServerAutomation) {
      this.emailServerAutomation.close();
    }
  }
}

module.exports = { EmailAutomation, DualEmailMonitor };