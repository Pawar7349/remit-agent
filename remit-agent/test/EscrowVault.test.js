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

  it("should revert if recipient is zero address", async function(){
    await expect(
      escrow.connect(sender).createRemittance(
        ethers.ZeroAddress,
        USDC(200),
        50,
        "US-MX",
        3600
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidRecipient");
  })

  it("should revert if fee exceeds 2% hard cap", async function(){
    await expect(
      escrow.connect(sender).createRemittance(
        recipient.address,
        USDC(200),
        201,
        "US-MX",
        3600
      )
    ).to.be.revertedWithCustomError(escrow, "InvalidAmount");
  });

  it("should emits RemittanceCreatedd event", async function(){
    await expect(
      escrow.connect(sender).createRemittance(
        recipient.address,
        USDC(200),
        50,
        "US-MX",
        3600
      )
    ).to.emit(escrow, "RemittanceCreated");
  });


  //Release tests

  it("agent calls release, recipient correct payout", async function(){

    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];
    
    //check balance befor release
    const balanceBefore = await mockUSDC.balanceOf(recipient.address);

    //agent releases
    await escrow.connect(agent).release(remittanceId);

    // check balance after release

    const balanceAfter = await mockUSDC.balanceOf(recipient.address);

    //calcullate expected  payout
    const amount = 200_000_000n;
    const fee = (amount * 50n) / 10000n;
    const expectedPayout = amount - fee;

    expect(balanceAfter - balanceBefore).to.equal(expectedPayout);
  })

  it("fee goes to feeCollector afer release", async function(){
    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];
    
    const balanceBefore = await mockUSDC.balanceOf(feeCollector.address);
    await escrow.connect(agent).release(remittanceId);

    const balanceAfter = await mockUSDC.balanceOf(feeCollector.address);
    
    const amount = 200_000_000n;
    const fee = (amount * 50n) / 10000n;

    expect(balanceAfter - balanceBefore).to.equal(fee);
  })

  it("reverts if called by non-agent", async function(){
    
    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];
    
    await expect(
      escrow.connect(sender).release(remittanceId)
    ).to.be.revert(ethers);
  })

  it("reverts if remittance already released", async function () {
     const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];

    await escrow.connect(agent).release(remittanceId);
     
  })

  it("emits RemittanceReleased event", async function(){
    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];

    await expect(
      escrow.connect(agent).release(remittanceId)
    ).to.emit(escrow, "RemittanceReleased");
  })

  //Refund Tests

  it("refund full amount to sender after TTL expires", async function(){
    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 60
    );

    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];

    await ethers.provider.send("evm_increaseTime", [61]); 
    await ethers.provider.send("evm_mine");

    const balanceBefore = await mockUSDC.balanceOf(sender.address);
    await escrow.connect(sender).refund(
      remittanceId
    );
    const balanceAfter = await mockUSDC.balanceOf(sender.address);
    
    expect(balanceAfter - balanceBefore).to.equal(USDC(200));
  })

  it("revert if TTL not expired yet", async function(){
    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 60
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];
    
    await expect( escrow.connect(sender).refund(
      remittanceId
    )).to.be.revertedWithCustomError(escrow, "NotExpiredYet");
  })

  it("reverts if already refunded", async function () {
    const tx = await escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 60
    );
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => log.fragment?.name === "RemittanceCreated");
    const remittanceId = event.args[0];

    await ethers.provider.send("evm_increaseTime", [61]); 
    await ethers.provider.send("evm_mine");
    
    await escrow.connect(sender).refund(
      remittanceId
    );
    
    await expect(escrow.connect(sender).refund(
      remittanceId
    )).to.be.revertedWithCustomError(escrow, "AlreadySettled");


  })

  //Pause

  it("blocks createRemittance when paused", async function(){
    await escrow.connect(owner).pause();
    await expect( escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    )).to.be.revert(ethers);
  })

  //unpause

  it("allows createRemittance after unpause", async function(){
    await escrow.connect(owner).pause();
    await escrow.connect(owner).unpause();

    await expect(escrow.connect(sender).createRemittance(
      recipient.address, USDC(200), 50, "US-MX", 3600
    )).to.not.be.revert(ethers);
  })




  

})

  

