import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const normalizeKey = (k: string) => (k.startsWith("0x") ? k : `0x${k}`);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8546", chainId: 31337 },
    fuji: {
      url: process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: DEPLOYER_PRIVATE_KEY ? [normalizeKey(DEPLOYER_PRIVATE_KEY)] : [],
    },
  },
  etherscan: {
    apiKey: { fuji: "snowtrace" },
    customChains: [
      {
        network: "fuji",
        chainId: 43113,
        urls: {
          apiURL: "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan",
          browserURL: "https://testnet.snowtrace.io",
        },
      },
    ],
  },
  sourcify: { enabled: false },
  typechain: { outDir: "typechain-types", target: "ethers-v6" },
};

export default config;
