import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  // ExamplePredictionMarket uses standard ERC-20 (MockUSDC), not ConfidentialERC20
  const mockUSDC = await hre.deployments.get("MockUSDC");

  // Settler = deployer for initial deployment (can be changed later via setSettler)
  const settlerAddress = process.env.SETTLER_ADDRESS || deployer;

  const result = await deploy("ExamplePredictionMarket", {
    from: deployer,
    args: [mockUSDC.address, settlerAddress],
    log: true,
  });

  console.log(`ExamplePredictionMarket deployed at: ${result.address}`);
  console.log(`  paymentToken: ${mockUSDC.address}`);
  console.log(`  settler: ${settlerAddress}`);

  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    try {
      await hre.run("verify:verify", {
        address: result.address,
        constructorArguments: [mockUSDC.address, settlerAddress],
      });
    } catch (e: any) {
      if (e.message?.includes("Already Verified")) {
        console.log(`ExamplePredictionMarket already verified`);
      } else {
        console.error(`ExamplePredictionMarket verification failed:`, e.message);
      }
    }
  }
};

export default func;
func.id = "deploy_ExamplePredictionMarket";
func.tags = ["ExamplePredictionMarket"];
func.dependencies = ["MockUSDC"];
