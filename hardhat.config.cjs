require("@nomiclabs/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "paris"
    },
  },
  paths: {
    sources: "./server", // Sözleşmelerin server klasöründe olduğunu doğruluyoruz
    artifacts: "./artifacts" // Derleme sonuçlarının gideceği yer
  },
  networks: {
    polygon: {
      url: "https://polygon-rpc.com", // Varsayılan Polygon Mainnet RPC
    },
  },
};