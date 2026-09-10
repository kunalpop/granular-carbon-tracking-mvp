// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title CarbonToken
/// @notice One ERC-1155 contract carrying the dissertation's dual token model:
///         - a NON-FUNGIBLE product passport (supply exactly 1 per product),
///           minted at product genesis, holding custody of the product record;
///         - a FUNGIBLE carbon-quantity token denominated in grams of CO2e,
///           minted per stage in proportion to that stage's emissions and
///           burned for end-of-life credits.
///         Token id scheme: passport id = productId; carbon id = productId +
///         2^128. Token balances are the cross-check, not the authority — the
///         authoritative record is the EmissionEventRegistry (Ong 2025 / v1.x
///         Dimension 9 caveat).
contract CarbonToken is ERC1155Supply, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public constant CARBON_OFFSET = 1 << 128;

    /// Cumulative mint/burn counters per product, so the aggregate can be
    /// cross-checked even after burns (net = minted - burned).
    mapping(uint256 => uint256) public carbonMinted; // grams
    mapping(uint256 => uint256) public carbonBurned; // grams

    event PassportMinted(uint256 indexed productId, address indexed to);
    event CarbonMinted(uint256 indexed productId, address indexed to, uint256 grams);
    event CarbonBurned(uint256 indexed productId, address indexed from, uint256 grams);

    error ProductIdTooLarge(uint256 productId);
    error PassportAlreadyMinted(uint256 productId);
    error NoPassport(uint256 productId);

    constructor(address admin) ERC1155("") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
    }

    function passportId(uint256 productId) public pure returns (uint256) {
        if (productId >= CARBON_OFFSET) revert ProductIdTooLarge(productId);
        return productId;
    }

    function carbonId(uint256 productId) public pure returns (uint256) {
        if (productId >= CARBON_OFFSET) revert ProductIdTooLarge(productId);
        return productId + CARBON_OFFSET;
    }

    /// @notice Mint the unique passport NFT at product genesis.
    function mintPassport(uint256 productId, address to) external onlyRole(MINTER_ROLE) {
        uint256 id = passportId(productId);
        if (totalSupply(id) != 0) revert PassportAlreadyMinted(productId);
        _mint(to, id, 1, "");
        emit PassportMinted(productId, to);
    }

    /// @notice Mint fungible carbon (grams CO2e) attributed to a product.
    function mintCarbon(uint256 productId, address to, uint256 grams) external onlyRole(MINTER_ROLE) {
        if (totalSupply(passportId(productId)) == 0) revert NoPassport(productId);
        carbonMinted[productId] += grams;
        _mint(to, carbonId(productId), grams, "");
        emit CarbonMinted(productId, to, grams);
    }

    /// @notice Burn carbon, e.g. an end-of-life recycling credit.
    function burnCarbon(uint256 productId, address from, uint256 grams) external onlyRole(MINTER_ROLE) {
        carbonBurned[productId] += grams;
        _burn(from, carbonId(productId), grams);
        emit CarbonBurned(productId, from, grams);
    }

    /// @notice Net carbon attributed to a product (minted - burned), signed so
    ///         the aggregator can compare it with a possibly-negative event sum.
    function netCarbon(uint256 productId) external view returns (int256) {
        return int256(carbonMinted[productId]) - int256(carbonBurned[productId]);
    }

    function passportExists(uint256 productId) external view returns (bool) {
        return totalSupply(passportId(productId)) != 0;
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
