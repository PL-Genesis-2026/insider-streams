import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // FHESecretMarketplace uses FHEConfidentialUSDC as payment token.
  // Always use the deployment artifact (all 4 contracts deploy in one session).
  const confidentialUSDC = await hre.deployments.get("FHEConfidentialUSDC");
  const confidentialUSDCAddress = confidentialUSDC.address;

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
