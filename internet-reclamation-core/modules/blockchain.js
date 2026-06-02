/**
 * @file blockchain.js
 * @description Wallet and automated smart contract bridge for the Internet Reclamation Core.
 * Interfaces with Polygon/EVM networks using ethers.js to submit cryptographic carbon proofs 
 * to the on-chain Carbon Registry, triggering swaps and green currency minting.
 * 
 * @author Senior Software Architect & Cybersecurity Expert
 * @license SPDX-License-Identifier: Apache-2.0
 */

const { ethers } = require('ethers');

class BlockchainRouter {
    /**
     * Creates an instance of BlockchainRouter.
     * @param {Object} options Configuration options.
     * @param {string} options.rpcUrl EVM RPC URL endpoint.
     * @param {string} options.privateKey Hot wallet private key.
     * @param {string} options.contractAddress On-chain Carbon Registry smart contract.
     */
    constructor(options = {}) {
        let rpc = options.rpcUrl || process.env.POLYGON_RPC_URL || process.env.RPC_URL;
        let pkey = options.privateKey || process.env.PRIVATE_KEY || process.env.INCOME_DISTRIBUTION_WALLET;
        let contract = options.contractAddress || process.env.CONTRACT_ADDRESS || process.env.CARBON_REGISTRY_CONTRACT || process.env.SMART_GATE_CONTRACT_ADDRESS;

        // Security Fix: Removed hardcoded 'Ghost' private key. System will default to simulation if no key provided.
        if (!pkey || pkey.includes('0x00000000') || pkey === 'YOUR_PRIVATE_KEY') {
            pkey = ''; 
        }

        // Ensure Private Key is properly 0x prefixed hex
        if (pkey && !pkey.startsWith('0x')) {
            pkey = '0x' + pkey;
        }

        // Fallback to stable public Polygon Mainnet RPC if not configured or has placeholder
        if (!rpc || rpc.includes('YOUR_API_KEY') || rpc.includes('polygon-mainnet.g.alchemy.com') || rpc.includes('YOUR_ALCHEMY_OR_INFURA_URL')) {
            rpc = 'https://polygon-rpc.com';
        }

        // Default or sanitize contract address
        if (!contract || contract.includes('0x000000000000000000000000')) {
            contract = '0x0000000000000000000000000000000000000000';
        }

        this.rpcEndpoints = Array.from(new Set([
            rpc,
            'https://polygon-rpc.com',
            'https://rpc.ankr.com/polygon',
            'https://polygon.llamarpc.com',
            'https://1rpc.io/matic',
            'https://polygon-mainnet.public.blastapi.io'
        ].filter(Boolean)));

        this.rpcUrl = this.rpcEndpoints[0];
        this.privateKey = pkey;
        this.contractAddress = contract;
        this.logCallback = null;

        // Contract custom ABI definition for the Carbon Mint & Swap mechanism
        this.contractAbi = [
            "function mintAndSwap(uint256 amount, string memory proof) public returns (bool)"
        ];
    }

    /**
     * Register real-time logging hook.
     * @param {Function} callback 
     */
    setLogger(callback) {
        this.logCallback = callback;
    }

    /**
     * Cybermatic terminal logging output.
     * @param {string} module 
     * @param {string} msg 
     */
    log(module, msg) {
        const timestamp = new Date().toISOString();
        const formatted = `[${timestamp}] [BLOCKCHAIN] ${msg}`;
        console.log(`\x1b[35m${formatted}\x1b[0m`); // Magenta cyber log
        if (this.logCallback) {
            this.logCallback(module, msg);
        }
    }

    /**
     * Connects to the EVM blockchain and submits proof criteria to mint/swap green credits.
     * 
     * @param {number} carbonGram Amount of saved carbon in grams.
     * @param {string} proofHash The cryptographic SHA-256 integrity stamp.
     * @returns {Promise<{success: boolean, txHash?: string, error?: string, simulated?: boolean}>}
     */
    async triggerBorsaSwap(carbonGram, proofHash) {
        this.log('INIT', `Connecting to decentralized network router (EVM/Polygon)...`);
        this.log('TRANSACTION', `Submitting Proof: ${proofHash} | Savings: ${carbonGram} CO2-g`);

        // Check if environment contains placeholder keys
        const isMockKey = !this.privateKey || 
                          this.privateKey.includes('0x00000000') || 
                          this.privateKey === 'YOUR_PRIVATE_KEY';
        
        const isMockRpc = !this.rpcUrl || 
                          this.rpcUrl.includes('YOUR_API_KEY') || 
                          this.rpcUrl.includes('polygon-mainnet.g.alchemy.com/v2/');

        if (isMockKey || isMockRpc) {
            this.log('WARNING', `Otonom test moduna geçiliyor. Simülasyon aktifleştirildi.`);
            await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate chain latency
            
            const mockTxHash = '0x' + require('crypto').randomBytes(32).toString('hex');
            
            this.log('MINT', `[SİMÜLASYON] Akıllı kontrat mintAndSwap başarıyla hesaplandı!`);
            this.log('RECEIPT', `[SİMÜLASYON] Blok onaylandı. İşlem Kodu (Tx Hash): ${mockTxHash}`);
            this.log('GREEN_BALANCE', `[SİMÜLASYON] Kazanılan Yeşil Kredi bakiyesi cüzdana tanımlandı!`);

            return {
                success: true,
                txHash: mockTxHash,
                simulated: true
            };
        }

        let lastError = null;
        for (let i = 0; i < this.rpcEndpoints.length; i++) {
            const currentRpc = this.rpcEndpoints[i];
            try {
                this.log('RPC_TRY', `Attempting network query via RPC [${i + 1}/${this.rpcEndpoints.length}]: ${currentRpc}`);
                
                // Establish RPC connection
                const provider = new ethers.providers.JsonRpcProvider(currentRpc);
                
                // Initialize wallet signer
                const wallet = new ethers.Wallet(this.privateKey, provider);
                const balance = await provider.getBalance(wallet.address);
                this.log('WALLET', `Signer initialized. EVM Address: ${wallet.address} | Balance: ${ethers.utils.formatEther(balance)} MATIC/POL`);

                // Check if contract is zero-address to trigger Direct Proof anchoring on-chain
                const isZeroContract = !this.contractAddress || 
                                       this.contractAddress === '0x0000000000000000000000000000000000000000' ||
                                       this.contractAddress.toLowerCase() === '0x';

                if (isZeroContract) {
                    this.log('DATA_ANCHOR', `No specific smart contract specified. Executing direct, live transaction to secure anchor your proof on-chain (Memo Proof mode)...`);
                    
                    // Embed the proof details into the transaction hex data
                    const memoMessage = `CARBON_PROOF:${proofHash}:${carbonGram.toFixed(4)}_CO2_g`;
                    const memoBytes = ethers.utils.hexlify(ethers.utils.toUtf8Bytes(memoMessage));

                    const txOptions = {
                        to: wallet.address, // Self transaction to securely record data with zero loss
                        value: ethers.utils.parseEther("0"),
                        data: memoBytes,
                        gasLimit: 30000
                    };

                    this.log('BROADCAST', `Broadcasting live secure proof on-chain...`);
                    const tx = await wallet.sendTransaction(txOptions);
                    this.log('BROADCAST_STATUS', `Tx successfully broadcast. Waiting for block confirmation... Hash: ${tx.hash}`);

                    const receipt = await tx.wait();
                    this.log('CONFIRMED', `Block verified. Gas used: ${receipt.gasUsed.toString()} | Block Height: ${receipt.blockNumber}`);
                    this.log('SUCCESS', `Proof permanently anchored on EVM Ledger. Tx: ${tx.hash}`);

                    return {
                        success: true,
                        txHash: tx.hash,
                        simulated: false
                    };
                } else {
                    // Instantiate on-chain contract representation for mint & swap
                    const contract = new ethers.Contract(this.contractAddress, this.contractAbi, wallet);

                    // Convert carbonGrams to standard smart contract integers (18 decimals)
                    const amountInWei = ethers.utils.parseEther(carbonGram.toString());

                    this.log('BROADCAST', `Broadcasting contract execution 'mintAndSwap' at: ${this.contractAddress}`);

                    const txOptions = {
                        gasLimit: 120000
                    };

                    const tx = await contract.mintAndSwap(amountInWei, proofHash, txOptions);
                    this.log('BROADCAST_STATUS', `Tx contract call broadcast successfully. Waiting for block confirmation... Hash: ${tx.hash}`);

                    const receipt = await tx.wait();
                    this.log('CONFIRMED', `Block verified. Gas used: ${receipt.gasUsed.toString()} | Block Height: ${receipt.blockNumber}`);
                    this.log('SUCCESS', `Contract 'mintAndSwap' fully executed. Green credits swapped.`);

                    return {
                        success: true,
                        txHash: tx.hash,
                        simulated: false
                    };
                }
            } catch (error) {
                lastError = error;
                this.log('RPC_FAIL', `EVM network query failed on RPC ${currentRpc}: ${error.message}. Checking failover nodes...`);
            }
        }

        this.log('FAILURE', `All specified EVM RPC failover gateways exhausted. Direct transmission aborted: ${lastError.message}`);
        return {
            success: false,
            error: lastError.message,
            simulated: false
        };
    }
}

module.exports = BlockchainRouter;
