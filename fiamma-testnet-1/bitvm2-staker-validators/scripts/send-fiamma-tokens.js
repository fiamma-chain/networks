const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Configuration
const config = {
  binary: 'fiammad',
  chainId: 'fiamma-testnet',
  nodeUrl: 'https://rpc-testnet.fiamma.network:26657',
  amount: '1000000ufiamma', // 1 FIAMMA
  validatorsDir: path.join(__dirname, '../validators'),
  // Get mnemonic from environment variable
  mnemonic: process.env.FAUCET_MNEMONIC
};

async function setupWallet() {
  try {
    console.log('🔑 Setting up wallet...');
    // Recover wallet using mnemonic from environment variable
    const command = `echo "${config.mnemonic}" | ${config.binary} keys add faucet --recover --keyring-backend test`;
    await execAsync(command);
    console.log('✅ Wallet setup completed');
  } catch (error) {
    console.error('❌ Failed to setup wallet:', error.message);
    throw error;
  }
}

async function sendTokens(address) {
  try {
    const command = `${config.binary} tx bank send \
      faucet \
      ${address} \
      ${config.amount} \
      --chain-id ${config.chainId} \
      --node ${config.nodeUrl} \
      --keyring-backend test \
      --yes`;

    const { stdout } = await execAsync(command);
    return stdout;
  } catch (error) {
    throw new Error(`Failed to send tokens: ${error.message}`);
  }
}

async function processValidators() {
  console.log('📂 Reading validators directory...');
  
  // Create or load send history log
  const sendLog = path.join(__dirname, 'token-send-log.json');
  let sentAddresses = {};
  
  // Load existing send history if available
  if (fs.existsSync(sendLog)) {
    sentAddresses = JSON.parse(fs.readFileSync(sendLog, 'utf8'));
  }

  // Read all validator files
  const files = fs.readdirSync(config.validatorsDir);
  
  console.log(`Found ${files.length} validator files`);

  for (const file of files) {
    if (!file.endsWith('.json')) continue;

    const filePath = path.join(config.validatorsDir, file);
    console.log(`\n📄 Processing ${file}...`);

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const { fiamma_address } = data;

      if (!fiamma_address) {
        console.log(`⚠️ No Fiamma address found in ${file}`);
        continue;
      }

      // Check if tokens were already sent
      if (sentAddresses[fiamma_address]) {
        console.log(`⏭️ Tokens already sent to ${fiamma_address}`);
        continue;
      }

      console.log(`💸 Sending tokens to ${fiamma_address}...`);
      const result = await sendTokens(fiamma_address);
      
      // Record successful send
      sentAddresses[fiamma_address] = {
        file,
        timestamp: new Date().toISOString(),
        amount: config.amount
      };
      
      // Update send history log
      fs.writeFileSync(sendLog, JSON.stringify(sentAddresses, null, 2));
      
      console.log(`✅ Tokens sent successfully to ${fiamma_address}`);
      console.log('Transaction result:', result);
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  console.log('\n✅ All validators processed');
}

async function main() {
  try {
    if (!config.mnemonic) {
      throw new Error('FAUCET_MNEMONIC environment variable is not set');
    }

    await setupWallet();
    await processValidators();
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
}

main(); 