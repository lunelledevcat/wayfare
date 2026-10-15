import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { HDNodeWallet, Signer } from "ethers";

const USDC = (n: number) => ethers.parseUnits(n.toString(), 6);

const EIP712_TYPES = {
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

type Leg = {
  operator: string;
  serviceId: string;
  price: bigint;
  departAt: bigint;
  refundDeadline: bigint;
  cancelFeeBps: number;
  label: string;
};
type Quote = { quoteId: string; passenger: string; pax: number; expiresAt: bigint; legs: Leg[] };

async function deployFixture() {
  const [owner, signer, flightOp, busOp, passenger, friend, stranger] = await ethers.getSigners();

  const usdc = await ethers.deployContract("MockUSDC");
  const ticket = await ethers.deployContract("WayfareTicket");
  const booking = await ethers.deployContract("WayfareBooking", [
    await usdc.getAddress(),
    await ticket.getAddress(),
    signer.address,
  ]);
  await ticket.setBooking(await booking.getAddress());
  await booking.registerOperator(flightOp.address, "SkyThai Air");
  await booking.registerOperator(busOp.address, "NorthStar Bus");
  await usdc.mint(passenger.address, USDC(10_000));
  await usdc.connect(passenger).approve(await booking.getAddress(), ethers.MaxUint256);

  const domain = {
    name: "WayfareBooking",
    version: "1",
    chainId: (await ethers.provider.getNetwork()).chainId,
    verifyingContract: await booking.getAddress(),
  };

  const now = BigInt(await time.latest());
  let counter = 0;
  const makeQuote = (overrides: Partial<Quote> = {}): Quote => {
    counter++;
    const departFlight = now + 86_400n;
    const departBus = now + 2n * 86_400n;
    return {
      quoteId: ethers.id(`quote-${counter}`),
      passenger: passenger.address,
      pax: 2,
      expiresAt: now + 600n,
      legs: [
        {
          operator: flightOp.address,
          serviceId: ethers.id("SKY101|2026-10-16"),
          price: USDC(50),
          departAt: departFlight,
          refundDeadline: departFlight - 3_600n,
          cancelFeeBps: 1_000,
          label: "BKK DMK -> CNX · SkyThai Air SK101",
        },
        {
          operator: busOp.address,
          serviceId: ethers.id("NSB22|2026-10-17"),
          price: USDC(12.5),
          departAt: departBus,
          refundDeadline: departBus - 3_600n,
          cancelFeeBps: 2_000,
          label: "Chiang Mai Arcade -> Chiang Rai · NorthStar Bus",
        },
      ],
      ...overrides,
    };
  };
  const sign = (q: Quote, by: Signer | HDNodeWallet = signer) => by.signTypedData(domain, EIP712_TYPES, q);

  return { owner, signer, flightOp, busOp, passenger, friend, stranger, usdc, ticket, booking, makeQuote, sign, domain };
}

async function bookedFixture() {
  const f = await deployFixture();
  const q = f.makeQuote();
  await f.booking.connect(f.passenger).bookTrip(q, await f.sign(q));
  return { ...f, q, tripId: 1n };
}

/** Sum of per-ticket payouts/refunds and outstanding escrow for a trip. */
async function tripAccounting(booking: any, tripId: bigint) {
  const trip = await booking.tripOf(tripId);
  let paidOut = 0n;
  let refunded = 0n;
  let outstanding = 0n;
  for (const id of trip.ticketIds) {
    const leg = await booking.legOf(id);
    paidOut += leg.paidOut;
    refunded += leg.refunded;
    if (leg.status === 0n) outstanding += leg.price;
  }
  return { total: trip.total as bigint, paidOut, refunded, outstanding };
}

async function expectInvariant(f: { booking: any; usdc: any }) {
  const count: bigint = await f.booking.tripCount();
  let outstandingAll = 0n;
  for (let id = 1n; id <= count; id++) {
    const a = await tripAccounting(f.booking, id);
    expect(a.paidOut + a.refunded + a.outstanding).to.equal(a.total);
    outstandingAll += a.outstanding;
  }
  expect(await f.usdc.balanceOf(await f.booking.getAddress())).to.equal(outstandingAll);
}

describe("MockUSDC", () => {
  it("has 6 decimals and symbol tUSDC", async () => {
    const { usdc } = await loadFixture(deployFixture);
    expect(await usdc.decimals()).to.equal(6);
    expect(await usdc.symbol()).to.equal("tUSDC");
    expect(await usdc.name()).to.equal("Test USDC");
  });

  it("faucet mints 1,000 once per hour", async () => {
    const { usdc, stranger } = await loadFixture(deployFixture);
    expect(await usdc.nextFaucetAt(stranger.address)).to.equal(0);
    await usdc.connect(stranger).faucet();
    expect(await usdc.balanceOf(stranger.address)).to.equal(USDC(1_000));
    const nextAt = await usdc.nextFaucetAt(stranger.address);
    expect(nextAt).to.equal(BigInt(await time.latest()) + 3_600n);
    await expect(usdc.connect(stranger).faucet()).to.be.revertedWithCustomError(usdc, "FaucetCooldown").withArgs(nextAt);
    await time.increaseTo(nextAt);
    await usdc.connect(stranger).faucet();
    expect(await usdc.balanceOf(stranger.address)).to.equal(USDC(2_000));
  });

  it("only owner can mint", async () => {
    const { usdc, stranger } = await loadFixture(deployFixture);
    await expect(usdc.connect(stranger).mint(stranger.address, 1)).to.be.revertedWithCustomError(
      usdc,
      "OwnableUnauthorizedAccount",
    );
  });
});

describe("WayfareBooking", () => {
  describe("bookTrip", () => {
    it("books 2 legs x 2 pax = 4 tickets with a single token transfer", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      const total = (USDC(50) + USDC(12.5)) * 2n;
      const tx = f.booking.connect(f.passenger).bookTrip(q, await f.sign(q));
      await expect(tx)
        .to.emit(f.booking, "TripBooked")
        .withArgs(1, f.passenger.address, q.quoteId, 2, total);
      await expect(tx).to.changeTokenBalances(f.usdc, [f.passenger, f.booking], [-total, total]);

      const receipt = await (await tx).wait();
      const usdcAddr = (await f.usdc.getAddress()).toLowerCase();
      const transferTopic = f.usdc.interface.getEvent("Transfer").topicHash;
      const usdcTransfers = receipt!.logs.filter(
        (l) => l.address.toLowerCase() === usdcAddr && l.topics[0] === transferTopic,
      );
      expect(usdcTransfers.length).to.equal(1);

      const trip = await f.booking.tripOf(1);
      expect(trip.passenger).to.equal(f.passenger.address);
      expect(trip.pax).to.equal(2);
      expect(trip.total).to.equal(total);
      expect(trip.ticketIds.map(Number)).to.deep.equal([1, 2, 3, 4]);
      expect(await f.ticket.balanceOf(f.passenger.address)).to.equal(4);
      expect((await f.ticket.ticketsOfOwner(f.passenger.address)).map(Number)).to.deep.equal([1, 2, 3, 4]);
      expect((await f.booking.tripsOf(f.passenger.address)).map(Number)).to.deep.equal([1]);
      expect((await f.booking.ticketsOfService(q.legs[0].serviceId)).map(Number)).to.deep.equal([1, 2]);
      expect((await f.booking.ticketsOfOperator(f.busOp.address)).map(Number)).to.deep.equal([3, 4]);

      const leg = await f.booking.legOf(3);
      expect(leg.operator).to.equal(f.busOp.address);
      expect(leg.price).to.equal(USDC(12.5));
      expect(leg.status).to.equal(0);
      expect(leg.label).to.equal(q.legs[1].label);

      const [trips, tickets, refunded, paid] = await f.booking.stats();
      expect([trips, tickets, refunded, paid]).to.deep.equal([1n, 4n, 0n, 0n]);
      await expectInvariant(f);
    });

    it("hashQuote matches ethers TypedDataEncoder", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      expect(await f.booking.hashQuote(q)).to.equal(ethers.TypedDataEncoder.hash(f.domain, EIP712_TYPES, q));
    });

    it("reverts on wrong signer", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      await expect(
        f.booking.connect(f.passenger).bookTrip(q, await f.sign(q, f.stranger)),
      ).to.be.revertedWithCustomError(f.booking, "InvalidSignature");
    });

    it("reverts on tampered quote and garbage signature", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      const sig = await f.sign(q);
      const tampered = { ...q, legs: [{ ...q.legs[0], price: 1n }, q.legs[1]] };
      await expect(f.booking.connect(f.passenger).bookTrip(tampered, sig)).to.be.revertedWithCustomError(
        f.booking,
        "InvalidSignature",
      );
      await expect(f.booking.connect(f.passenger).bookTrip(q, "0x1234")).to.be.revertedWithCustomError(
        f.booking,
        "InvalidSignature",
      );
    });

    it("reverts on expired quote", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      const sig = await f.sign(q);
      await time.increaseTo(q.expiresAt + 1n);
      await expect(f.booking.connect(f.passenger).bookTrip(q, sig)).to.be.revertedWithCustomError(
        f.booking,
        "QuoteExpired",
      );
    });

    it("reverts on reused quoteId", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      const sig = await f.sign(q);
      await f.booking.connect(f.passenger).bookTrip(q, sig);
      await expect(f.booking.connect(f.passenger).bookTrip(q, sig)).to.be.revertedWithCustomError(
        f.booking,
        "QuoteAlreadyUsed",
      );
    });

    it("reverts when caller is not the passenger", async () => {
      const f = await loadFixture(deployFixture);
      const q = f.makeQuote();
      await expect(f.booking.connect(f.stranger).bookTrip(q, await f.sign(q))).to.be.revertedWithCustomError(
        f.booking,
        "NotPassenger",
      );
    });

    it("reverts on inactive or unknown operator", async () => {
      const f = await loadFixture(deployFixture);
      await f.booking.setOperatorActive(f.busOp.address, false);
      const q = f.makeQuote();
      await expect(f.booking.connect(f.passenger).bookTrip(q, await f.sign(q)))
        .to.be.revertedWithCustomError(f.booking, "OperatorInactive")
        .withArgs(f.busOp.address);

      const q2 = f.makeQuote({ legs: [{ ...f.makeQuote().legs[0], operator: f.stranger.address }] });
      await expect(f.booking.connect(f.passenger).bookTrip(q2, await f.sign(q2)))
        .to.be.revertedWithCustomError(f.booking, "OperatorInactive")
        .withArgs(f.stranger.address);
    });

    it("reverts on bad pax / leg count / fee", async () => {
      const f = await loadFixture(deployFixture);
      for (const bad of [
        f.makeQuote({ pax: 0 }),
        f.makeQuote({ pax: 10 }),
        f.makeQuote({ legs: [] }),
        f.makeQuote({ legs: Array(6).fill(f.makeQuote().legs[0]) }),
        f.makeQuote({ legs: [{ ...f.makeQuote().legs[0], cancelFeeBps: 10_001 }] }),
      ]) {
        await expect(f.booking.connect(f.passenger).bookTrip(bad, await f.sign(bad))).to.be.revertedWithCustomError(
          f.booking,
          "BadQuote",
        );
      }
    });

    it("only owner can manage operators and signer", async () => {
      const f = await loadFixture(deployFixture);
      await expect(
        f.booking.connect(f.stranger).registerOperator(f.stranger.address, "X"),
      ).to.be.revertedWithCustomError(f.booking, "OwnableUnauthorizedAccount");
      await expect(f.booking.connect(f.stranger).setQuoteSigner(f.stranger.address)).to.be.revertedWithCustomError(
        f.booking,
        "OwnableUnauthorizedAccount",
      );
      await expect(f.booking.setOperatorActive(f.stranger.address, true))
        .to.be.revertedWithCustomError(f.booking, "OperatorNotRegistered")
        .withArgs(f.stranger.address);
      expect(await f.booking.operatorList()).to.deep.equal([f.flightOp.address, f.busOp.address]);
      expect(await f.booking.operatorInfo(f.flightOp.address)).to.deep.equal(["SkyThai Air", true]);
    });
  });

  describe("checkIn", () => {
    it("pays the leg operator immediately", async () => {
      const f = await loadFixture(bookedFixture);
      {
        const tx = f.booking.connect(f.flightOp).checkIn(1);
        await expect(tx).to.emit(f.booking, "CheckedIn")
        .withArgs(1, f.flightOp.address, USDC(50));
        await expect(tx).to.changeTokenBalances(f.usdc, [f.flightOp, f.booking, f.busOp], [USDC(50), -USDC(50), 0]);
        }
      expect((await f.booking.legOf(1)).status).to.equal(1);
      await expectInvariant(f);
    });

    it("rejects other operators and double check-in", async () => {
      const f = await loadFixture(bookedFixture);
      await expect(f.booking.connect(f.busOp).checkIn(1)).to.be.revertedWithCustomError(f.booking, "NotLegOperator");
      await f.booking.connect(f.flightOp).checkIn(1);
      await expect(f.booking.connect(f.flightOp).checkIn(1)).to.be.revertedWithCustomError(f.booking, "InvalidStatus");
      await expect(f.booking.connect(f.flightOp).checkIn(99)).to.be.revertedWithCustomError(f.booking, "UnknownTicket");
    });
  });

  describe("cancelByOperator", () => {
    it("refunds full price to the current holder (after transfer)", async () => {
      const f = await loadFixture(bookedFixture);
      await f.ticket.connect(f.passenger).transferFrom(f.passenger.address, f.friend.address, 3);
      {
        const tx = f.booking.connect(f.busOp).cancelByOperator(3);
        await expect(tx).to.emit(f.booking, "CancelledByOperator")
        .withArgs(3, f.friend.address, USDC(12.5));
        await expect(tx).to.changeTokenBalances(f.usdc, [f.friend, f.passenger, f.booking], [USDC(12.5), 0, -USDC(12.5)]);
        }
      expect((await f.booking.legOf(3)).status).to.equal(2);
      await expectInvariant(f);
    });

    it("cancels many tickets at once", async () => {
      const f = await loadFixture(bookedFixture);
      const ids = await f.booking.ticketsOfService(f.q.legs[0].serviceId);
      await expect(f.booking.connect(f.flightOp).cancelManyByOperator([...ids])).to.changeTokenBalances(
        f.usdc,
        [f.passenger, f.booking],
        [USDC(100), -USDC(100)],
      );
      const [, , refunded] = await f.booking.stats();
      expect(refunded).to.equal(USDC(100));
      await expectInvariant(f);
    });

    it("only the leg operator may cancel", async () => {
      const f = await loadFixture(bookedFixture);
      await expect(f.booking.connect(f.stranger).cancelByOperator(1)).to.be.revertedWithCustomError(
        f.booking,
        "NotLegOperator",
      );
    });
  });

  describe("cancelByPassenger", () => {
    it("refunds price minus fee, fee to operator", async () => {
      const f = await loadFixture(bookedFixture);
      // flight: 50 tUSDC, 10% fee
      {
        const tx = f.booking.connect(f.passenger).cancelByPassenger(1);
        await expect(tx).to.emit(f.booking, "CancelledByPassenger")
        .withArgs(1, f.passenger.address, USDC(45), USDC(5));
        await expect(tx).to.changeTokenBalances(f.usdc, [f.passenger, f.flightOp, f.booking], [USDC(45), USDC(5), -USDC(50)]);
        }
      const leg = await f.booking.legOf(1);
      expect(leg.status).to.equal(3);
      expect(leg.refunded).to.equal(USDC(45));
      expect(leg.paidOut).to.equal(USDC(5));
      await expectInvariant(f);
    });

    it("reverts for non-holder and after the refund deadline", async () => {
      const f = await loadFixture(bookedFixture);
      await expect(f.booking.connect(f.stranger).cancelByPassenger(1)).to.be.revertedWithCustomError(
        f.booking,
        "NotTicketHolder",
      );
      await time.increaseTo(f.q.legs[0].refundDeadline);
      await expect(f.booking.connect(f.passenger).cancelByPassenger(1)).to.be.revertedWithCustomError(
        f.booking,
        "RefundDeadlinePassed",
      );
    });

    it("cannot cancel a checked-in ticket", async () => {
      const f = await loadFixture(bookedFixture);
      await f.booking.connect(f.flightOp).checkIn(1);
      await expect(f.booking.connect(f.passenger).cancelByPassenger(1)).to.be.revertedWithCustomError(
        f.booking,
        "InvalidStatus",
      );
    });
  });

  describe("claimNoShow", () => {
    it("only after departAt + 2h", async () => {
      const f = await loadFixture(bookedFixture);
      const departAt = f.q.legs[0].departAt;
      await time.increaseTo(departAt + 7_200n - 2n);
      await expect(f.booking.connect(f.flightOp).claimNoShow(1)).to.be.revertedWithCustomError(
        f.booking,
        "NoShowTooEarly",
      );
      await time.increaseTo(departAt + 7_200n);
      {
        const tx = f.booking.connect(f.flightOp).claimNoShow(1);
        await expect(tx).to.emit(f.booking, "NoShowClaimed")
        .withArgs(1, f.flightOp.address, USDC(50));
        await expect(tx).to.changeTokenBalance(f.usdc, f.flightOp, USDC(50));
        }
      expect((await f.booking.legOf(1)).status).to.equal(4);
      await expect(f.booking.connect(f.flightOp).claimNoShow(1)).to.be.revertedWithCustomError(
        f.booking,
        "InvalidStatus",
      );
      await expect(f.booking.connect(f.busOp).claimNoShow(2)).to.be.revertedWithCustomError(
        f.booking,
        "NotLegOperator",
      );
      await expectInvariant(f);
    });
  });

  describe("invariant", () => {
    it("paid out + refunded + outstanding == total per trip, across every action", async () => {
      const f = await loadFixture(deployFixture);
      const q1 = f.makeQuote();
      await f.booking.connect(f.passenger).bookTrip(q1, await f.sign(q1));
      const q2 = f.makeQuote({ pax: 3 });
      await f.booking.connect(f.passenger).bookTrip(q2, await f.sign(q2));
      await expectInvariant(f);

      await f.booking.connect(f.flightOp).checkIn(1); // trip 1
      await f.booking.connect(f.busOp).cancelByOperator(3); // trip 1
      await f.booking.connect(f.passenger).cancelByPassenger(4); // trip 1, 20% fee
      await f.booking.connect(f.flightOp).cancelByOperator(5); // trip 2
      await f.booking.connect(f.passenger).cancelByPassenger(6); // trip 2
      await expectInvariant(f);

      await time.increaseTo(q1.legs[1].departAt + 7_200n);
      await f.booking.connect(f.flightOp).claimNoShow(2);
      await f.booking.connect(f.flightOp).checkIn(7);
      await f.booking.connect(f.busOp).claimNoShow(8);
      await expectInvariant(f);

      // trip 1 fully settled
      const a1 = await tripAccounting(f.booking, 1n);
      expect(a1.outstanding).to.equal(0n);
      expect(a1.paidOut + a1.refunded).to.equal(a1.total);

      const [trips, tickets, refunded, paid] = await f.booking.stats();
      expect(trips).to.equal(2n);
      expect(tickets).to.equal(10n);
      let sumRefunded = 0n;
      let sumPaid = 0n;
      for (const id of [1n, 2n]) {
        const a = await tripAccounting(f.booking, id);
        sumRefunded += a.refunded;
        sumPaid += a.paidOut;
      }
      expect(refunded).to.equal(sumRefunded);
      expect(paid).to.equal(sumPaid);
    });
  });
});

describe("WayfareTicket", () => {
  it("only booking can mint, booking set once", async () => {
    const f = await loadFixture(deployFixture);
    await expect(f.ticket.mint(f.owner.address)).to.be.revertedWithCustomError(f.ticket, "NotBooking");
    await expect(f.ticket.setBooking(f.owner.address)).to.be.revertedWithCustomError(f.ticket, "BookingAlreadySet");
  });

  it("transfer while Booked works", async () => {
    const f = await loadFixture(bookedFixture);
    await f.ticket.connect(f.passenger).transferFrom(f.passenger.address, f.friend.address, 2);
    expect(await f.ticket.ownerOf(2)).to.equal(f.friend.address);
    expect((await f.ticket.ticketsOfOwner(f.friend.address)).map(Number)).to.deep.equal([2]);
  });

  it("transfer after check-in / cancel reverts TicketLocked", async () => {
    const f = await loadFixture(bookedFixture);
    await f.booking.connect(f.flightOp).checkIn(1);
    await expect(f.ticket.connect(f.passenger).transferFrom(f.passenger.address, f.friend.address, 1))
      .to.be.revertedWithCustomError(f.ticket, "TicketLocked")
      .withArgs(1);
    await f.booking.connect(f.busOp).cancelByOperator(3);
    await expect(
      f.ticket.connect(f.passenger)["safeTransferFrom(address,address,uint256)"](f.passenger.address, f.friend.address, 3),
    ).to.be.revertedWithCustomError(f.ticket, "TicketLocked");
  });

  it("tokenURI is base64 JSON with an embedded SVG", async () => {
    const f = await loadFixture(bookedFixture);
    const uri: string = await f.ticket.tokenURI(1);
    expect(uri.startsWith("data:application/json;base64,")).to.equal(true);
    const json = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
    expect(json.name).to.equal("Wayfare Ticket #1");
    expect(json.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
    const svg = Buffer.from(json.image.split(",")[1], "base64").toString("utf8");
    expect(svg).to.contain("<svg");
    expect(svg).to.contain("WAYFARE");
    expect(svg).to.contain("#1463FF");
    expect(svg).to.contain("SkyThai Air");
    expect(svg).to.contain("BKK DMK -&gt; CNX");
    expect(svg).to.contain("BOOKED");
    const attrs = Object.fromEntries(json.attributes.map((a: any) => [a.trait_type, a.value]));
    expect(attrs.Operator).to.equal("SkyThai Air");
    expect(attrs.Route).to.equal(f.q.legs[0].label);
    expect(attrs.Departure).to.equal(Number(f.q.legs[0].departAt));
    expect(attrs.Status).to.equal("BOOKED");
    expect(attrs["Price (tUSDC)"]).to.equal("50.00");

    // UTC formatting
    const d = new Date(Number(f.q.legs[0].departAt) * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const expected = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
    expect(svg).to.contain(expected);

    await f.booking.connect(f.flightOp).checkIn(1);
    const json2 = JSON.parse(Buffer.from((await f.ticket.tokenURI(1)).split(",")[1], "base64").toString("utf8"));
    expect(json2.attributes.find((a: any) => a.trait_type === "Status").value).to.equal("CHECKED IN");
    expect((await f.ticket.tokenURI(3)).length).to.be.greaterThan(100);
  });

  it("supports ERC721 + Enumerable interfaces", async () => {
    const f = await loadFixture(deployFixture);
    expect(await f.ticket.supportsInterface("0x80ac58cd")).to.equal(true);
    expect(await f.ticket.supportsInterface("0x780e9d63")).to.equal(true);
  });
});
