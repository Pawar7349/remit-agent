// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title EscrowVault
 * @notice Locks USDC from sender, releases to recipient on confirmation
 *         or refunds sender if delivery fails. Core of RemitAgent.
*/
contract EscrowVault is ReentrancyGuard, AccessControl, Pausable {

  // Roles 
  bytes32 public constant AGENT_ROLE  = keccak256("AGENT_ROLE");
  bytes32 public constant ADMIN_ROLE  = keccak256("ADMIN_ROLE");

  // State 
  IERC20 public immutable usdc;

  enum Status { Pending, Released, Refunded }

  struct Remittance {
    address sender;
    address recipient;
    uint256 amount;       // in USDC (6 decimals)
    uint256 fee;          // platform fee deducted on release
    uint256 createdAt;
    uint256 expiresAt;    // auto-refund after this timestamp
    Status  status;
    string  corridor;     // e.g. "US-MX", "US-BR"
  }

  mapping(bytes32 => Remittance) public remittances;
  address public feeCollector;
  uint256 public totalVolume;
  uint256 public totalSaved;   

  // Events 
  event RemittanceCreated(
    bytes32 indexed id,
    address indexed sender,
    address indexed recipient,
    uint256 amount,
    string corridor
  );
    
  event RemittanceReleased(bytes32 indexed id, uint256 fee);
  event RemittanceRefunded(bytes32 indexed id);
  event CircuitBreaker(address triggeredBy);

  // Errors 
  error InvalidAmount();
  error InvalidRecipient();
  error AlreadySettled();
  error NotExpiredYet();
  error TransferFailed();
  error RemittanceNotFound();

  // Constructor 
  constructor(address _usdc, address _feeCollector) {

    require(_usdc != address(0), "Invalid USDC");
    require(_feeCollector != address(0), "Invalid fee collector");

    usdc         = IERC20(_usdc);
    feeCollector = _feeCollector;

    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _grantRole(ADMIN_ROLE,         msg.sender);
    _grantRole(AGENT_ROLE,         msg.sender);
  }

  //  Core Functions 

  /**
    * @notice Sender deposits USDC into escrow for a remittance
    * @param recipient  Wallet address of the receiver
    * @param amount     USDC amount (6 decimals, e.g. 200_000_000 = $200)
    * @param feeBps     Fee in basis points (e.g. 50 = 0.5%)
    * @param corridor   Route string e.g. "US-MX"
    * @param ttl        Time-to-live in seconds (e.g. 3600 = 1 hour)
  */
  function createRemittance(
    address recipient,
    uint256 amount,
    uint256 feeBps,
    string calldata corridor,
    uint256 ttl
  ) external nonReentrant whenNotPaused returns (bytes32 id) 
  {

    if (amount == 0)              revert InvalidAmount();
    if (recipient == address(0))  revert InvalidRecipient();
    if (feeBps > 200)             revert InvalidAmount(); // max 2% fee hard cap

    // Transfer USDC from sender to this contract
    bool ok = usdc.transferFrom(msg.sender, address(this), amount);
    if (!ok) revert TransferFailed();

    // Generate unique ID
    id = keccak256(abi.encodePacked(
    msg.sender, recipient, amount, block.timestamp, corridor
    ));

    uint256 fee = (amount * feeBps) / 10_000;

    remittances[id] = Remittance({

      sender:    msg.sender,
      recipient: recipient,
      amount:    amount,
      fee:       fee,
      createdAt: block.timestamp,
      expiresAt: block.timestamp + ttl,
      status:    Status.Pending,
      corridor:  corridor
    });

    // Track impact stats (for demo: show $ saved vs Western Union 6%)
    uint256 wuFee      = (amount * 600) / 10_000;
    uint256 saved      = wuFee > fee ? wuFee - fee : 0;
    totalSaved        += saved;
    totalVolume       += amount;

    emit RemittanceCreated(id, msg.sender, recipient, amount, corridor);
  }

  /**
  * @notice Agent confirms delivery and releases funds to recipient
  * @param id  Remittance ID
  */
  function release(bytes32 id)
  external
  onlyRole(AGENT_ROLE)
  nonReentrant
  whenNotPaused
  {

    Remittance storage r = remittances[id];
    if (r.sender == address(0))        revert RemittanceNotFound();
    if (r.status != Status.Pending)    revert AlreadySettled();

    r.status = Status.Released;

    uint256 payout = r.amount - r.fee;

    //Send fee to collector
    if (r.fee > 0) {
      bool feeOk = usdc.transfer(feeCollector, r.fee);
      if (!feeOk) revert TransferFailed();
    }

    // Send payout to recipient
    bool ok = usdc.transfer(r.recipient, payout);
    if (!ok) revert TransferFailed();

    emit RemittanceReleased(id, r.fee);
  }

  /**
  * @notice Anyone can trigger a refund after TTL expires
  * @param id  Remittance ID
  */
  function refund(bytes32 id) external nonReentrant {
    Remittance storage r = remittances[id];
    if (r.sender == address(0))      revert RemittanceNotFound();
    if (r.status != Status.Pending)  revert AlreadySettled();
    if (block.timestamp < r.expiresAt) revert NotExpiredYet();

    r.status = Status.Refunded;

    bool ok = usdc.transfer(r.sender, r.amount);
    if (!ok) revert TransferFailed();

    emit RemittanceRefunded(id);
  }

  //Admin Functions 

  /// @notice Emergency stop — pauses all new deposits and releases
  function pause() external onlyRole(ADMIN_ROLE){
    _pause();
    emit CircuitBreaker(msg.sender);
  }

  function unpause() external onlyRole(ADMIN_ROLE) {
    _unpause();
  }

  function setFeeCollector(address _new)
  external onlyRole(ADMIN_ROLE)
  {
    require(_new != address(0), "Invalid address");
    feeCollector = _new;
  }

  function grantAgentRole(address agent)
  external onlyRole(ADMIN_ROLE)
  {
    _grantRole(AGENT_ROLE, agent);
  }

  //  View Functions 

  function getRemittance(bytes32 id)
    external view returns (Remittance memory)
  {
    return remittances[id];
  }

  function getImpactStats()
    external view returns (uint256 volume, uint256 saved)
  {
    return (totalVolume, totalSaved);
  }
}