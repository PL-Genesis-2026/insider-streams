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

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    try {
      await hre.run("verify:verify", {
        address: result.address,
        constructorArguments: [],
      });
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log(`MockUSDC already verified`);
      } else {
        console.error(`MockUSDC verification failed:`, e.message);
      }
    }
  }
};

export default func;
func.id = "deploy_MockUSDC";
func.tags = ["MockUSDC"];
