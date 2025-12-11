const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const LocalNFT = await hre.ethers.getContractFactory("LocalNFT");
  const nft = await LocalNFT.deploy();
  await nft.waitForDeployment();

  const nftAddress = await nft.getAddress();
  console.log("LocalNFT deployed to:", nftAddress);

  const tx = await nft.mint(deployer.address);
  await tx.wait();
  console.log("Minted tokenId 0 to deployer");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

