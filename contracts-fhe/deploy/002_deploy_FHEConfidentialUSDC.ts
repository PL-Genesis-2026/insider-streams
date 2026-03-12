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

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    try {
      await hre.run("verify:verify", {
        address: result.address,
        constructorArguments: [deployer],
      });
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log(`FHEConfidentialUSDC already verified`);
      } else {
        console.error(`FHEConfidentialUSDC verification failed:`, e.message);
      }
    }
  }
};

export default func;
func.id = "deploy_FHEConfidentialUSDC";
func.tags = ["FHEConfidentialUSDC"];
