// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    // Peg-specific functions (added for automatic 0.01 USDC peg)
    function setPegManager(address _pegManager) external;
    function mintForPeg(address to, uint256 amount) external;
    function burnForPeg(address from, uint256 amount) external;

    // Bridge-specific functions (Solana & Cronos)
    function setBridgeManager(address _bridgeManager) external;
    function mintForBridge(address to, uint256 amount) external;
    function burnForBridge(address from, uint256 amount) external;

    // Collateral-specific functions (USDC deposit/withdraw model)
    function setCollateralManager(address _collateralManager) external;
    function mintForCollateral(address to, uint256 amount) external;
    function burnForCollateral(address from, uint256 amount) external;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
