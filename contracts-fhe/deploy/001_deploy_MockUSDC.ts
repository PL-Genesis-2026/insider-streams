import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const result = await deploy("MockUSDC", {
    from: deployer,
    log: true,
  });

  console.log(`MockUSDC deployed at: ${result.address}`);
};

export default func;
func.id = "deploy_MockUSDC";
func.tags = ["MockUSDC"];
