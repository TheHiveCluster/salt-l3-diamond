// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { LibDiamond } from "../libraries/LibDiamond.sol";

/**
 * @title TimelockFacet (Minimal)
 * @notice Basic timelock for critical owner actions on the Diamond.
 * All sensitive admin calls should go through this with a delay.
 */
contract TimelockFacet {
    event CallQueued(bytes32 indexed id, address target, bytes data, uint256 eta);
    event CallExecuted(bytes32 indexed id);

    bytes32 constant TIMELOCK_STORAGE = keccak256("salt.timelock.storage");

    struct TimelockStorage {
        mapping(bytes32 => uint256) queuedAt;
        uint256 delay; // in seconds, e.g. 1 days
        address admin; // can be the diamond owner or a multisig
    }

    function timelockStorage() internal pure returns (TimelockStorage storage ts) {
        bytes32 position = TIMELOCK_STORAGE;
        assembly { ts.slot := position }
    }

    function setDelay(uint256 newDelay) external {
        require(msg.sender == timelockStorage().admin || LibDiamond.contractOwner() == address(this), "Timelock: not authorized");
        timelockStorage().delay = newDelay;
    }

    function queueCall(address target, bytes calldata data) external returns (bytes32) {
        require(msg.sender == timelockStorage().admin || msg.sender == LibDiamond.contractOwner(), "Timelock: not admin");
        bytes32 id = keccak256(abi.encode(target, data, block.timestamp));
        timelockStorage().queuedAt[id] = block.timestamp;
        emit CallQueued(id, target, data, block.timestamp + timelockStorage().delay);
        return id;
    }

    function executeCall(address target, bytes calldata data) external {
        bytes32 id = keccak256(abi.encode(target, data, block.timestamp));
        uint256 queued = timelockStorage().queuedAt[id];
        require(queued > 0, "Timelock: not queued");
        require(block.timestamp >= queued + timelockStorage().delay, "Timelock: delay not passed");

        (bool success, ) = target.call(data);
        require(success, "Timelock: call failed");

        delete timelockStorage().queuedAt[id];
        emit CallExecuted(id);
    }

    function getDelay() external view returns (uint256) {
        return timelockStorage().delay;
    }

    function initializeTimelock(address _admin, uint256 _delay) external {
        LibDiamond.enforceIsContractOwner();
        TimelockStorage storage ts = timelockStorage();
        ts.admin = _admin;
        ts.delay = _delay;
    }
}
