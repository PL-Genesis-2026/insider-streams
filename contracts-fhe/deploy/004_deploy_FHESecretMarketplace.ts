import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // FHESecretMarketplace uses ConfidentialERC20 (FHEConfidentialUSDC) as payment token.
  // On live networks (Sepolia), prefer env var to avoid accidental redeployment of USDC.
  // On local hardhat network, always use the deployment artifact.
  const isLocalNetwork = hre.network.name === "hardhat" || hre.network.name === "localhost";
  let confidentialUSDCAddress: string;
  if (!isLocalNetwork && process.env.CONFIDENTIAL_USDC_ADDRESS) {
    confidentialUSDCAddress = process.env.CONFIDENTIAL_USDC_ADDRESS;
  } else {
    const confidentialUSDC = await hre.deployments.get("FHEConfidentialUSDC");
    confidentialUSDCAddress = confidentialUSDC.address;
  }

  // Settler = deployer for initial deployment (can be changed later via setSettler)
  const settlerAddress = process.env.SETTLER_ADDRESS || deployer;

  const result = await deploy("FHESecretMarketplace", {
    from: deployer,
    args: [confidentialUSDCAddress, settlerAddress],
    log: true,
  });

  console.log(`FHESecretMarketplace deployed at: ${result.address}`);
  console.log(`  paymentToken: ${confidentialUSDCAddress}`);
  console.log(`  settler: ${settlerAddress}`);
};

export default func;
func.id = "deploy_FHESecretMarketplace";
func.tags = ["FHESecretMarketplace"];
// Only depend on FHEConfidentialUSDC if CONFIDENTIAL_USDC_ADDRESS is not set in env
func.dependencies = ["FHEConfidentialUSDC"];
