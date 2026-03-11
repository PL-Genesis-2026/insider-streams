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
};

export default func;
func.id = "deploy_ExamplePredictionMarket";
func.tags = ["ExamplePredictionMarket"];
func.dependencies = ["MockUSDC"];
