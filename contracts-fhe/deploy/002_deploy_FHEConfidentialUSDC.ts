import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const result = await deploy("FHEConfidentialUSDC", {
    from: deployer,
    args: [deployer], // owner = deployer
    log: true,
  });

  console.log(`FHEConfidentialUSDC deployed at: ${result.address}`);
};

export default func;
func.id = "deploy_FHEConfidentialUSDC";
func.tags = ["FHEConfidentialUSDC"];
