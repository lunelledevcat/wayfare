import hre, { ethers } from "hardhat";
import type { Signer } from "ethers";
import { quoteSignerKey, readDeployment } from "./lib";

const QUOTE_TYPES = {
  Leg: [
    { name: "operator", type: "address" },
    { name: "serviceId", type: "bytes32" },
    { name: "price", type: "uint256" },
    { name: "departAt", type: "uint64" },
    { name: "refundDeadline", type: "uint64" },
    { name: "cancelFeeBps", type: "uint16" },
    { name: "label", type: "string" },
  ],
  Quote: [
    { name: "quoteId", type: "bytes32" },
    { name: "passenger", type: "address" },
    { name: "pax", type: "uint8" },
    { name: "expiresAt", type: "uint64" },
    { name: "legs", type: "Leg[]" },
  ],
};

const USDC = (n: number) => ethers.parseUnits(n.toFixed(2), 6);
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

async function operatorSigner(index: number, address: string): Promise<Signer> {
  const mnemonic = process.env.OPERATOR_MNEMONIC?.trim();
  if (mnemonic) {
    return ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`).connect(ethers.provider);
  }
  const s = (await ethers.getSigners())[index + 2];
  if (s.address.toLowerCase() !== address.toLowerCase()) throw new Error(`Operator ${index} signer mismatch`);
  return s;
}

/** On public testnets make sure the operator has a little AVAX for gas. */
async function ensureGas(deployer: Signer, to: string) {
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") return;
  const bal = await ethers.provider.getBalance(to);
  const min = ethers.parseEther("0.02");
  if (bal < min) {
    console.log(`  funding ${to} with 0.05 AVAX for gas`);
    await (await deployer.sendTransaction({ to, value: ethers.parseEther("0.05") })).wait();
  }
}

async function main() {
  const d = readDeployment(hre.network.name);
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const isLocal = hre.network.name === "localhost" || hre.network.name === "hardhat";
  const passenger = isLocal ? signers[7] : deployer;

  const usdc = await ethers.getContractAt("MockUSDC", d.usdc);
  const booking = await ethers.getContractAt("WayfareBooking", d.booking);
  const quoteWallet = new ethers.Wallet(quoteSignerKey());
  if ((await booking.quoteSigner()).toLowerCase() !== quoteWallet.address.toLowerCase()) {
    throw new Error("QUOTE_SIGNER_PRIVATE_KEY does not match the on-chain quote signer");
  }
  const domain = {
    name: "WayfareBooking",
    version: "1",
    chainId: d.chainId,
    verifyingContract: d.booking,
  };

  console.log(`Seeding ${hre.network.name}: passenger ${passenger.address}`);
  await (await usdc.connect(deployer).mint(passenger.address, USDC(5_000))).wait();
  await (await usdc.connect(passenger).approve(d.booking, ethers.MaxUint256)).wait();

  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  // Departures ~1.5 days from now, rounded to the hour, so every refund deadline is still in the future.
  const tomorrow9 = Math.ceil((now + 36 * 3600) / 3600) * 3600;
  const op = (name: string) => {
    const o = d.operators.find((x) => x.name === name);
    if (!o) throw new Error(`operator ${name} missing`);
    return o.address;
  };

  const flightAt = tomorrow9;
  const busAt = tomorrow9 + 4 * 3600;
  const trainAt = tomorrow9 + 86400 + 9 * 3600;

  const quotes = [
    {
      quoteId: ethers.id(`seed-${d.booking}-1`),
      passenger: passenger.address,
      pax: 2,
      expiresAt: now + 600,
      legs: [
        {
          operator: op("SkyThai Air"),
          serviceId: ethers.id(`SK101|${day(flightAt)}`),
          price: USDC(42.5),
          departAt: flightAt,
          refundDeadline: flightAt - 3 * 3600,
          cancelFeeBps: 1000,
          label: "BKK DMK -> CNX · SkyThai Air SK101",
        },
        {
          operator: op("NorthStar Bus"),
          serviceId: ethers.id(`NS808|${day(busAt)}`),
          price: USDC(6.2),
          departAt: busAt,
          refundDeadline: busAt - 2 * 3600,
          cancelFeeBps: 1500,
          label: "Chiang Mai Arcade -> Chiang Rai · NorthStar Bus NS808",
        },
      ],
    },
    {
      quoteId: ethers.id(`seed-${d.booking}-2`),
      passenger: passenger.address,
      pax: 1,
      expiresAt: now + 600,
      legs: [
        {
          operator: op("Lanna Rail Express"),
          serviceId: ethers.id(`LR9|${day(trainAt)}`),
          price: USDC(28),
          departAt: trainAt,
          refundDeadline: trainAt - 6 * 3600,
          cancelFeeBps: 2000,
          label: "Krung Thep Aphiwat -> Chiang Mai · Lanna Rail Express LR9",
        },
      ],
    },
  ];

  const tripIds: bigint[] = [];
  for (const q of quotes) {
    const sig = await quoteWallet.signTypedData(domain, QUOTE_TYPES, q);
    const rc = await (await booking.connect(passenger).bookTrip(q, sig)).wait();
    const ev = rc!.logs
      .map((l) => {
        try {
          return booking.interface.parseLog(l);
        } catch {
          return null;
        }
      })
      .find((x) => x?.name === "TripBooked");
    tripIds.push(ev!.args.tripId);
    console.log(`  booked trip #${ev!.args.tripId} (${q.legs.length} legs x ${q.pax} pax)`);
  }

  const trip1 = await booking.tripOf(tripIds[0]);
  const [flightTicket, , busTicket] = trip1.ticketIds;

  const sky = await operatorSigner(0, op("SkyThai Air"));
  const bus = await operatorSigner(1, op("NorthStar Bus"));
  await ensureGas(deployer, await sky.getAddress());
  await ensureGas(deployer, await bus.getAddress());

  await (await booking.connect(sky).checkIn(flightTicket)).wait();
  console.log(`  checked in ticket #${flightTicket} (SkyThai Air paid)`);
  await (await booking.connect(bus).cancelByOperator(busTicket)).wait();
  console.log(`  operator cancelled ticket #${busTicket} (passenger refunded)`);

  const [trips, tickets, refunded, paid] = await booking.stats();
  console.log(
    `Stats: trips=${trips} tickets=${tickets} refunded=${ethers.formatUnits(refunded, 6)} paidToOperators=${ethers.formatUnits(paid, 6)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
