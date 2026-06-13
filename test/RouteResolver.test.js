import {expect} from "chai";
import {network} from "hardhat";

describe("RouteResolver", function(){
  let resolver, owner, agent;
  let ethers;

  before(async function () {
    const connection = await network.create();
    ethers = connection.ethers;
  });

  beforeEach(async function () {
    [ owner, agent] = await ethers.getSigners();

    const RouteResolver = await ethers.getContractFactory("RouteResolver");
    resolver = await RouteResolver.deploy();

    await resolver.grantRole(await resolver.AGENT_ROLE(), agent.address);
  });

  it("should initialize Base and Arbitrum routes correctly", async function () {
    const baseRoute  = await resolver.routes("Base");
    const arbRoute  = await resolver.routes("Arbitrum");

    expect(baseRoute.gasFee).to.equal(10000n);
    expect(arbRoute.gasFee).to.equal(40000n);

  })

  it("updateFee updates the gas fee correctly", async function () {
    await resolver.connect(agent).updateFee("Base", 5000);
    const baseRoute  = await resolver.routes("Base");
    expect(baseRoute.gasFee).to.equal(5000n);
  })


  it("getBestRoute returns Base when base is cheaper", async function () {
    await resolver.connect(agent).updateFee("Base", 5000);
    await resolver.connect(agent).updateFee("Arbitrum", 40000);

    const [routeName, fee] = await resolver.getBestRoute();
    expect(routeName).to.equal("Base");

  })

  it("getBestRoute returns Arbitrum when Arbitrum is cheaper",async function () {
    await resolver.connect(agent).updateFee("Base", 40000);
    await resolver.connect(agent).updateFee("Arbitrum", 5000);

    const [routeName, fee] = await resolver.getBestRoute();
    expect(routeName).to.equal("Arbitrum");
  })






})