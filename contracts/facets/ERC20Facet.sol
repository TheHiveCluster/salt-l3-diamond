// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/******************************************************************************\
* ERC20 Facet for Intern (SALT) token on Diamond proxy
* Name: Intern, Symbol: SALT, Decimals: 18
* Supports mint/burn by owner, token metadata settings
/******************************************************************************/

import { LibDiamond } from "../libraries/LibDiamond.sol";
import { LibERC20 } from "../libraries/LibERC20.sol";
import { IERC20 } from "../interfaces/IERC20.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";

contract ERC20Facet is IERC20, IERC20Metadata {
    using LibERC20 for LibERC20.ERC20Storage;

    function name() external view override returns (string memory) {
        return LibERC20.erc20Storage().name;
    }

    function symbol() external view override returns (string memory) {
        return LibERC20.erc20Storage().symbol;
    }

    function decimals() external view override returns (uint8) {
        return LibERC20.erc20Storage().decimals;
    }

    function totalSupply() external view override returns (uint256) {
        return LibERC20.erc20Storage().totalSupply;
    }

    function balanceOf(address account) external view override returns (uint256) {
        return LibERC20.erc20Storage().balances[account];
    }

    function transfer(address recipient, uint256 amount) external override returns (bool) {
        _transfer(msg.sender, recipient, amount);
        return true;
    }

    function allowance(address owner, address spender) external view override returns (uint256) {
        return LibERC20.erc20Storage().allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) external override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) external override returns (bool) {
        _transfer(sender, recipient, amount);
        uint256 currentAllowance = LibERC20.erc20Storage().allowances[sender][msg.sender];
        require(currentAllowance >= amount, "ERC20: transfer amount exceeds allowance");
        _approve(sender, msg.sender, currentAllowance - amount);
        return true;
    }

    function _transfer(address sender, address recipient, uint256 amount) internal {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(sender != address(0), "ERC20: transfer from zero address");
        require(recipient != address(0), "ERC20: transfer to zero address");
        require(es.balances[sender] >= amount, "ERC20: transfer amount exceeds balance");

        es.balances[sender] -= amount;
        es.balances[recipient] += amount;
        emit Transfer(sender, recipient, amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(owner != address(0), "ERC20: approve from zero address");
        require(spender != address(0), "ERC20: approve to zero address");
        es.allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function setTokenSettings(string memory _name, string memory _symbol, uint8 _decimals) external {
        LibDiamond.enforceIsContractOwner();
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        es.name = _name;
        es.symbol = _symbol;
        es.decimals = _decimals;
    }

    function mint(address to, uint256 amount) external {
        LibDiamond.enforceIsContractOwner();
        LibERC20._mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        LibDiamond.enforceIsContractOwner();
        LibERC20._burn(from, amount);
    }

    function burn(uint256 amount) external {
        LibERC20._burn(msg.sender, amount);
    }

    // === Peg Manager Role (for automatic 0.01 USDC peg) ===

    function setPegManager(address _pegManager) external {
        LibDiamond.enforceIsContractOwner();
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        es.pegManager = _pegManager;
    }

    function mintForPeg(address to, uint256 amount) external {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(msg.sender == es.pegManager, "ERC20: caller is not peg manager");
        LibERC20._mint(to, amount);
    }

    function burnForPeg(address from, uint256 amount) external {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(msg.sender == es.pegManager, "ERC20: caller is not peg manager");
        LibERC20._burn(from, amount);
    }

    // === Bridge Manager Role (for Solana & Cronos cross-chain) ===

    function setBridgeManager(address _bridgeManager) external {
        LibDiamond.enforceIsContractOwner();
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        es.bridgeManager = _bridgeManager;
    }

    function mintForBridge(address to, uint256 amount) external {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(msg.sender == es.bridgeManager, "ERC20: caller is not bridge manager");
        LibERC20._mint(to, amount);
    }

    function burnForBridge(address from, uint256 amount) external {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(msg.sender == es.bridgeManager, "ERC20: caller is not bridge manager");
        LibERC20._burn(from, amount);
    }

    // === Collateral Manager Role (USDC deposit → mint SALT, and vice versa) ===

    function setCollateralManager(address _collateralManager) external {
        LibDiamond.enforceIsContractOwner();
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        es.collateralManager = _collateralManager;
    }

    function mintForCollateral(address to, uint256 amount) external {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(msg.sender == es.collateralManager, "ERC20: caller is not collateral manager");
        LibERC20._mint(to, amount);
    }

    function burnForCollateral(address from, uint256 amount) external {
        LibERC20.ERC20Storage storage es = LibERC20.erc20Storage();
        require(msg.sender == es.collateralManager, "ERC20: caller is not collateral manager");
        LibERC20._burn(from, amount);
    }
}
