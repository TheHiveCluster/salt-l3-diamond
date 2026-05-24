// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* ERC20 storage library for Diamond proxy pattern
/******************************************************************************/

library LibERC20 {
    bytes32 constant ERC20_STORAGE_POSITION = keccak256("salt.intern.erc20.diamond.storage");

    struct ERC20Storage {
        string name;
        string symbol;
        uint8 decimals;
        uint256 totalSupply;
        mapping(address => uint256) balances;
        mapping(address => mapping(address => uint256)) allowances;
        address pegManager;        // legacy algorithmic peg (can be deprecated)
        address bridgeManager;     // for cross-chain bridge
        address collateralManager; // for USDC deposit/withdraw mint/burn (new primary model)
    }

    function erc20Storage() internal pure returns (ERC20Storage storage es) {
        bytes32 position = ERC20_STORAGE_POSITION;
        assembly {
            es.slot := position
        }
    }

    function _mint(address to, uint256 amount) internal {
        ERC20Storage storage es = erc20Storage();
        es.totalSupply += amount;
        es.balances[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address from, uint256 amount) internal {
        ERC20Storage storage es = erc20Storage();
        require(es.balances[from] >= amount, "ERC20: burn amount exceeds balance");
        es.balances[from] -= amount;
        es.totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
