import { expect } from "chai";
import { network } from "hardhat";

describe("EscrowVault", function () {

  let escrow, mockUSDC, owner, agent, sender, recipient, feeCollector;
  let ethers;

  before(async function() {
    const connection = await network.create();
    ethers = connection.ethers;
  });

  const USDC = (amount) => ethers.parseUnits(amount.toString(), 6);

  beforeEach(async function () {
    [owner, agent, sender, recipient, feeCollector] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);

    const EscrowVault = await ethers.getContractFactory("EscrowVault");
    escrow = await EscrowVault.deploy(
      await mockUSDC.getAddress(),
      feeCollector.address
    );

    await escrow.grantAgentRole(agent.address);
    await mockUSDC.mint(sender.address, USDC(10000));
    await mockUSDC.connect(sender).approve(
      await escrow.getAddress(),
      USDC(10000)
    );
  });

  it("should deploy successfully", async function () {
    expect(await escrow.feeCollector()).to.equal(feeCollector.address);
  });

  it("should  lock USDC in the contract", async function(){
    await escrow.connect(sender).createRemittance(
      recipient.address,
      USDC(200),
      50,
      "US-MX",
      3600
    )
    const balance = await mockUSDC.balanceOf(await escrow.getAddress());
    expect(balance).to.equal(USDC(200));
  })
   
  //reverts when amount is zero
  it("should revert if amount is zero", async function(){
    await expect(
      escrow.connect(sender).createRemittance(
        recipient.address,
        USDC(0),
        50,
        "US-MX",
        3600
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
  })


});