// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol"; 

contract RouteResolver is AccessControl  {
  struct Route {
    string name;
    uint256 gasFee;
    bool isActive;
    uint256 lastUpdated;
  }
   
  mapping(string => Route) public routes;

  bytes32 public constant AGENT_ROLE  = keccak256("AGENT_ROLE");
  

  constructor(){
    routes["Base"] = Route({
      name: "Base",
      gasFee: 10000,    // $0.01 in USDC 6 decimals
      isActive: true,
      lastUpdated: block.timestamp
    });

    routes["Arbitrum"] = Route({
      name: "Arbitrum",
      gasFee: 40000,    // $0.01 in USDC 6 decimals
      isActive: true,
      lastUpdated: block.timestamp
    });

    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(AGENT_ROLE, msg.sender);
  }

  function updateFee(string calldata routeName, uint256 newFee)
  external
  onlyRole(AGENT_ROLE)
  {
    routes[routeName].gasFee = newFee;
    routes[routeName].lastUpdated = block.timestamp;
  }

  function getBestRoute()
  external 
  view 
  returns(string memory routeName, uint256 fee)
  {
    if(routes["Base"].gasFee <= routes["Arbitrum"].gasFee){
      return ("Base",routes["Base"].gasFee);
    }
    else{
      return ("Arbitrum", routes["Arbitrum"].gasFee);
    }
  }
  



  
  


}