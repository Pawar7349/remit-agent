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
  });

  it("should initialize Base and Arbitrum routes correctly", async function () {
    const baseRoute  = await resolver.routes("Base");
    const arbRoute  = await resolver.routes("Arbitrum");

    expect(baseRoute.gasFee).to.equal(10000n);
    expect(arbRoute.gasFee).to.equal(40000n);

  })





})