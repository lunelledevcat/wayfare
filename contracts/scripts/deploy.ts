import hre, { ethers } from "hardhat";
import { DEMO_OPERATORS, quoteSignerKey, writeDeployment, writeGenerated, type DeploymentJson } from "./lib";

async function operatorAddresses(): Promise<string[]> {
  const mnemonic = process.env.OPERATOR_MNEMONIC?.trim();
  if (mnemonic) {
    return DEMO_OPERATORS.map((_, i) => ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${i}`).address);
  }
  if (hre.network.name === "fuji") {
    throw new Error("OPERATOR_MNEMONIC is required on fuji (operators need their own keys to check in passengers).");
  }
  const signers = await ethers.getSigners();
  return DEMO_OPERATORS.map((_, i) => signers[i + 2].address);
}

async function verify(address: string, constructorArguments: unknown[]) {
  try {
    await hre.run("verify:verify", { address, constructorArguments });
    console.log(`  verified ${address}`);
  } catch (e) {
    console.warn(`  verify skipped for ${address}: ${(e as Error).message.split("\n")[0]}`);
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account — set DEPLOYER_PRIVATE_KEY in .env");
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  const quoteSigner = new ethers.Wallet(quoteSignerKey()).address;
  console.log(`Network ${hre.network.name} (${chainId}), deployer ${deployer.address}, quote signer ${quoteSigner}`);

  const usdc = await ethers.deployContract("MockUSDC");
  await usdc.waitForDeployment();
  const deployTx = usdc.deploymentTransaction();
  const deployBlock = deployTx ? ((await deployTx.wait())?.blockNumber ?? 0) : 0;
  const ticket = await ethers.deployContract("WayfareTicket");
  await ticket.waitForDeployment();
  const booking = await ethers.deployContract("WayfareBooking", [
    await usdc.getAddress(),
    await ticket.getAddress(),
    quoteSigner,
  ]);
  await booking.waitForDeployment();
  await (await ticket.setBooking(await booking.getAddress())).wait();
  console.log(`  MockUSDC       ${await usdc.getAddress()}`);
  console.log(`  WayfareTicket  ${await ticket.getAddress()}`);
  console.log(`  WayfareBooking ${await booking.getAddress()}`);

  const addrs = await operatorAddresses();
  const operators = DEMO_OPERATORS.map((o, i) => ({ address: addrs[i], name: o.name, kind: o.kind }));
  for (const o of operators) {
    await (await booking.registerOperator(o.address, o.name)).wait();
    console.log(`  operator ${o.name.padEnd(20)} ${o.address}`);
  }

  const d: DeploymentJson = {
    chainId,
    network: hre.network.name,
    usdc: await usdc.getAddress(),
    ticket: await ticket.getAddress(),
    booking: await booking.getAddress(),
    quoteSigner,
    deployer: deployer.address,
    deployBlock,
    deployedAt: new Date().toISOString(),
    operators,
  };
  writeDeployment(d);
  await writeGenerated(hre);

  if (hre.network.name === "fuji") {
    console.log("Verifying on Snowtrace (routescan)...");
    await verify(d.usdc, []);
    await verify(d.ticket, []);
    await verify(d.booking, [d.usdc, d.ticket, quoteSigner]);
    console.log(`Explorer: https://testnet.snowtrace.io/address/${d.booking}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
