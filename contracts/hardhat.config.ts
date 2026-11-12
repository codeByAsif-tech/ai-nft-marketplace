// Hardhat 3 config. Based on the official "mocha + ethers" template
// (@nomicfoundation/hardhat-toolbox-mocha-ethers). Hardhat 3 configs are
// TypeScript, but this file uses plain JavaScript syntax only.
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.34",
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    },
  },
  networks: {
    // In-memory simulated chain used by `hardhat test` and `deploy:sim`.
    // Uses Hardhat's built-in, publicly known TEST accounts. No real keys, no real ETH.
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    // A long-running local node started with `npm run node` (also test accounts only).
    localhost: {
      type: "http",
      chainType: "l1",
      url: "http://127.0.0.1:8545",
    },
    // Sepolia / Base Sepolia are added in Phase 7. A testnet-only deployer key will be
    // read from Hardhat's encrypted keystore or env vars, never committed.
  },
});
